import csv
import os
import json
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from akamai.edgegrid import EdgeGridAuth, EdgeRc
from google.oauth2 import service_account
from googleapiclient.discovery import build
from ratelimit import limits, sleep_and_retry

from backend.job_manager import Job
from backend.mock_data import account_details, accounts, summary_metrics, summary_panels


def get_akamai_config() -> dict[str, str]:
    return {
        "edge_rc_path": os.getenv("EDGE_RC_PATH") or str(Path.home() / ".edgerc"),
        "edge_rc_section": os.getenv("EDGE_RC_SECTION") or "default",
        "account_map_path": os.getenv("AKAMAI_ACCOUNT_MAP_PATH") or "backend/account_id_map.json",
        "storage_dir": os.getenv("AKAMAI_STORAGE_DIR") or "backend/storage",
    }


def _resolve_backend_path(raw_path: str) -> Path:
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return (Path(__file__).resolve().parent.parent / path).resolve()


def get_storage_dir() -> Path:
    cfg = get_akamai_config()
    path = _resolve_backend_path(cfg["storage_dir"])
    path.mkdir(parents=True, exist_ok=True)
    return path


def _index_account_mapping_by_csv_dir(payload: dict[str, Any]) -> dict[str, dict[str, str]]:
    """Re-key a raw account-mapping JSON payload by csvAccountDir, the identifier used in account
    URLs and in every per-account NetStorage report path (matrix CSVs, etc.)."""
    indexed: dict[str, dict[str, str]] = {}
    for key, value in payload.items():
        if isinstance(value, str):
            indexed[key] = {"accountName": key, "accountId": value, "csvAccountDir": key}
            continue

        if isinstance(value, dict):
            account_id = value.get("accountId") or value.get("account_id")
            account_name = value.get("accountName") or value.get("account_name") or key
            csv_account_dir = value.get("csvAccountDir") or value.get("csv_account_dir") or key
            if isinstance(account_id, str) and account_id.strip():
                indexed[str(csv_account_dir)] = {
                    "accountName": str(account_name),
                    "accountId": account_id.strip(),
                    "csvAccountDir": str(csv_account_dir),
                }

    return indexed


def _load_local_account_id_map() -> dict[str, dict[str, str]]:
    """Fallback account map read from the local backend/account_id_map.json, re-keyed by csvAccountDir."""
    cfg = get_akamai_config()
    path = _resolve_backend_path(cfg["account_map_path"])
    if not path.exists():
        raise FileNotFoundError(f"Akamai account map file not found: {path}")

    payload = json.loads(path.read_text())
    if not isinstance(payload, dict):
        raise ValueError("Akamai account map must be a JSON object")

    indexed = _index_account_mapping_by_csv_dir(payload)
    if not indexed:
        raise ValueError("Akamai account map has no valid entries")

    return indexed


_ACCOUNT_MAPPING_CACHE: dict[str, Any] = {"data": None, "loaded_at": 0.0}
_ACCOUNT_MAPPING_CACHE_TTL_SECONDS = 30


def load_account_id_map() -> dict[str, dict[str, str]]:
    """Universal account map keyed by csvAccountDir, used to validate account presence and to
    resolve per-account NetStorage report paths.

    Tries the LIVE NetStorage account_mapping.json (NSCPCODE/staticSiteContent/allAccounts/
    account_mapping.json) first, and only falls back to the local backend/account_id_map.json if
    that remote fetch fails or yields no valid entries. Results are cached briefly to avoid
    re-downloading the mapping file multiple times within the same request."""
    now = time.time()
    cached = _ACCOUNT_MAPPING_CACHE["data"]
    if cached is not None and (now - _ACCOUNT_MAPPING_CACHE["loaded_at"]) < _ACCOUNT_MAPPING_CACHE_TTL_SECONDS:
        return cached

    try:
        payload = download_ns_json(ACCOUNT_MAPPING_RELATIVE_PATH, None)
        if not isinstance(payload, dict):
            raise ValueError("NetStorage account_mapping.json must be a JSON object")
        indexed = _index_account_mapping_by_csv_dir(payload)
        if not indexed:
            raise ValueError("NetStorage account_mapping.json has no valid entries")
    except Exception:
        indexed = _load_local_account_id_map()

    _ACCOUNT_MAPPING_CACHE["data"] = indexed
    _ACCOUNT_MAPPING_CACHE["loaded_at"] = now
    return indexed


def create_akamai_session() -> tuple[requests.Session, str]:
    cfg = get_akamai_config()
    edge_rc_path = Path(cfg["edge_rc_path"]).expanduser()
    if not edge_rc_path.exists():
        raise FileNotFoundError(f".edgerc file not found: {edge_rc_path}")

    edgerc = EdgeRc(edge_rc_path)
    base_url = f"https://{edgerc.get(cfg['edge_rc_section'], 'host')}"

    session = requests.Session()
    session.auth = EdgeGridAuth.from_edgerc(edgerc, cfg["edge_rc_section"])
    session.headers.update({"Content-Type": "application/json", "Accept": "application/json"})
    return session, base_url


@sleep_and_retry
@limits(calls=100, period=60)
def fetch_account_switch_keys(session: requests.Session, base_url: str, account_id: str) -> requests.Response:
    url = urljoin(base_url, "/identity-management/v3/api-clients/self/account-switch-keys")
    return session.get(url, params={"search": account_id})


@sleep_and_retry
@limits(calls=100, period=60)
def fetch_hostname_coverage(session: requests.Session, base_url: str) -> requests.Response:
    url = urljoin(base_url, "/appsec/v1/hostname-coverage")
    return session.get(url)


def resolve_account_switch_key(matches: list[dict[str, Any]], account_id: str) -> dict[str, Any]:
    if not matches:
        raise ValueError(f"No Akamai account matched account ID: {account_id}")

    if len(matches) == 1:
        return matches[0]

    exact_matches = [match for match in matches if match.get("accountName") == account_id]
    if len(exact_matches) == 1:
        return exact_matches[0]

    raise ValueError(f"Multiple Akamai accounts matched account ID: {account_id}")


def normalize_hostname_coverage(hostnames: list[dict[str, Any]]) -> dict[str, Any]:
    covered_count = 0
    not_covered_count = 0
    unknown_count = 0
    rows: list[dict[str, Any]] = []

    for hostname in hostnames:
        raw_status = hostname.get("status")
        if raw_status == "covered":
            status = "covered"
            covered_count += 1
        elif raw_status == "not_covered":
            status = "not_covered"
            not_covered_count += 1
        else:
            status = "unknown"
            unknown_count += 1

        rows.append(
            {
                "hostname": hostname.get("hostname", ""),
                "status": status,
                "securityConfiguration": hostname.get("configuration", {}).get("name"),
                "hasMatchTarget": bool(hostname.get("hasMatchTarget")),
                "securityPolicies": hostname.get("policyNames") or [],
            }
        )

    return {
        "totals": {
            "covered": covered_count,
            "notCovered": not_covered_count,
            "unknown": unknown_count,
            "total": covered_count + not_covered_count + unknown_count,
        },
        "hostnames": rows,
    }


def get_account_hostname_coverage(account_key: str) -> dict[str, Any]:
    try:
        mapping = load_account_id_map()
    except Exception as error:
        return {"source": "akamai", "data": None, "error": str(error)}

    account_metadata = mapping.get(account_key)
    if not account_metadata:
        return {"source": "akamai", "data": None, "error": f"No mapping found for account key: {account_key}"}

    account_id = account_metadata["accountId"]
    account_name = account_metadata["accountName"]

    try:
        session, base_url = create_akamai_session()

        switch_key_response = fetch_account_switch_keys(session, base_url, account_id)
        if switch_key_response.status_code != 200:
            return {
                "source": "akamai",
                "data": None,
                "error": f"Identity API failed with status code {switch_key_response.status_code}",
            }

        selected_account = resolve_account_switch_key(switch_key_response.json(), account_id)
        account_switch_key = selected_account.get("accountSwitchKey")
        if not account_switch_key:
            return {"source": "akamai", "data": None, "error": "Missing accountSwitchKey in identity response"}

        session.params = {"accountSwitchKey": account_switch_key}

        hostname_response = fetch_hostname_coverage(session, base_url)
        if hostname_response.status_code != 200:
            return {
                "source": "akamai",
                "data": None,
                "error": f"AppSec hostname coverage API failed with status code {hostname_response.status_code}",
            }

        coverage_payload = hostname_response.json().get("hostnameCoverage") or []
        normalized = normalize_hostname_coverage(coverage_payload)

        return {
            "source": "akamai",
            "data": {
                "accountKey": account_key,
                "accountName": account_name,
                "accountId": account_id,
                **normalized,
            },
        }
    except Exception as error:
        return {"source": "akamai", "data": None, "error": str(error)}


FEATURE_MATRIX_COLUMNS = [
    "propertyId",
    "propertyName",
    "contractId",
    "groupId",
    "propertyVersion",
    "hostname",
    "originServers",
    "behaviors",
    "stagingActivatedAt",
    "stagingActivatedBy",
    "productionActivatedAt",
    "productionActivatedBy",
]

HOST2CNAME_COLUMNS = ["hostname", "resolvedValue", "recordType"]

PROPERTY_WORKER_COUNT = int(os.getenv("AKAMAI_PROPERTY_WORKERS") or 8)
DNS_WORKER_COUNT = int(os.getenv("AKAMAI_DNS_WORKERS") or 16)
RATE_LIMIT_COOLOFF_SECONDS = int(os.getenv("AKAMAI_RATE_LIMIT_COOLOFF_SECONDS") or 60)


def call_with_cooloff(job: Job, description: str, fetch_fn, *args, max_attempts: int = 3, **kwargs) -> requests.Response:
    """Call an Akamai API function, pausing and retrying if WAF/API rate limiting (429) is hit."""
    attempt = 0
    while True:
        response = fetch_fn(*args, **kwargs)
        attempt += 1
        if response.status_code != 429 or attempt >= max_attempts:
            return response
        job.log(
            f"Rate limited by Akamai while {description} (attempt {attempt}/{max_attempts}); "
            f"cooling off for {RATE_LIMIT_COOLOFF_SECONDS}s...",
            level="warning",
        )
        time.sleep(RATE_LIMIT_COOLOFF_SECONDS)
        job.log(f"Resuming {description} after cool-off", level="info")

PROPERTY_WORKER_COUNT = int(os.getenv("AKAMAI_PROPERTY_WORKERS") or 8)
DNS_WORKER_COUNT = int(os.getenv("AKAMAI_DNS_WORKERS") or 16)


@sleep_and_retry
@limits(calls=100, period=60)
def fetch_papi_groups(session: requests.Session, base_url: str) -> requests.Response:
    url = urljoin(base_url, "/papi/v1/groups")
    return session.get(url)


@sleep_and_retry
@limits(calls=100, period=60)
def fetch_papi_properties(session: requests.Session, base_url: str, contract_id: str, group_id: str) -> requests.Response:
    url = urljoin(base_url, "/papi/v1/properties")
    return session.get(url, params={"contractId": contract_id, "groupId": group_id})


@sleep_and_retry
@limits(calls=100, period=60)
def fetch_property_hostnames(
    session: requests.Session, base_url: str, property_id: str, version: int, contract_id: str, group_id: str
) -> requests.Response:
    url = urljoin(base_url, f"/papi/v1/properties/{property_id}/versions/{version}/hostnames")
    return session.get(url, params={"contractId": contract_id, "groupId": group_id})


@sleep_and_retry
@limits(calls=100, period=60)
def fetch_property_rules(
    session: requests.Session, base_url: str, property_id: str, version: int, contract_id: str, group_id: str
) -> requests.Response:
    url = urljoin(base_url, f"/papi/v1/properties/{property_id}/versions/{version}/rules")
    return session.get(url, params={"contractId": contract_id, "groupId": group_id})


@sleep_and_retry
@limits(calls=100, period=60)
def fetch_property_activations(
    session: requests.Session, base_url: str, property_id: str, contract_id: str, group_id: str
) -> requests.Response:
    url = urljoin(base_url, f"/papi/v1/properties/{property_id}/activations")
    return session.get(url, params={"contractId": contract_id, "groupId": group_id})


@sleep_and_retry
@limits(calls=100, period=60)
def resolve_hostname_via_google_dns(hostname: str, record_type: str) -> requests.Response:
    return requests.get("https://dns.google/resolve", params={"name": hostname, "type": record_type}, timeout=10)


def extract_behaviors(rules_node: dict[str, Any]) -> list[str]:
    """Recursively collect every enabled behavior name from a PAPI rule tree."""
    names: list[str] = []

    def walk(node: dict[str, Any]) -> None:
        for behavior in node.get("behaviors", []) or []:
            name = behavior.get("name")
            if name:
                names.append(name)
        for child in node.get("children", []) or []:
            walk(child)

    walk(rules_node)
    return sorted(set(names))


def extract_origin_hostnames(rules_node: dict[str, Any]) -> list[str]:
    """Recursively collect origin hostnames configured via the 'origin' behavior."""
    origins: list[str] = []

    def walk(node: dict[str, Any]) -> None:
        for behavior in node.get("behaviors", []) or []:
            if behavior.get("name") == "origin":
                origin_hostname = behavior.get("options", {}).get("hostname")
                if origin_hostname:
                    origins.append(origin_hostname)
        for child in node.get("children", []) or []:
            walk(child)

    walk(rules_node)
    return sorted(set(origins))


def summarize_activations(activation_items: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    """Return the most recent ACTIVE activation per network with its timestamp and user."""
    latest: dict[str, dict[str, str]] = {}
    for item in activation_items:
        network = item.get("network")
        if network not in {"STAGING", "PRODUCTION"} or item.get("status") != "ACTIVE":
            continue
        update_date = item.get("updateDate") or item.get("submitDate") or ""
        current = latest.get(network)
        if not current or update_date > current.get("updateDate", ""):
            latest[network] = {
                "updateDate": update_date,
                "updatedByUser": item.get("updatedByUser", ""),
            }
    return latest


def fetch_property_hostname_list(
    session: requests.Session, base_url: str, contract_id: str, group_id: str, prop: dict[str, Any], job: Job
) -> list[str]:
    """Group #1: pull just the hostnames configured on a single property."""
    property_id = prop.get("propertyId")
    version = prop.get("latestVersion") or prop.get("productionVersion") or prop.get("stagingVersion")
    if not property_id or not version:
        return []

    response = call_with_cooloff(
        job,
        f"fetching hostnames for property {property_id}",
        fetch_property_hostnames,
        session,
        base_url,
        property_id,
        version,
        contract_id,
        group_id,
    )
    if response.status_code != 200:
        return []

    return [
        item.get("cnameFrom", "")
        for item in response.json().get("hostnames", {}).get("items", [])
        if item.get("cnameFrom")
    ]


def fetch_hostnames_stage(
    session: requests.Session, base_url: str, property_tasks: list[tuple[str, str, dict[str, Any]]], job: Job
) -> dict[str, list[str]]:
    """Group #1: pull hostnames for every property in parallel, reporting progress as each completes."""
    total = len(property_tasks)
    job.log(f"Group 1/3: fetching hostnames for {total} properties...", percent=10)

    results: dict[str, list[str]] = {}
    completed = 0

    with ThreadPoolExecutor(max_workers=PROPERTY_WORKER_COUNT) as executor:
        futures = {
            executor.submit(fetch_property_hostname_list, session, base_url, contract_id, group_id, prop, job): prop
            for contract_id, group_id, prop in property_tasks
        }
        for future in as_completed(futures):
            prop = futures[future]
            property_id = prop.get("propertyId")
            property_name = prop.get("propertyName", property_id)
            completed += 1
            percent = 10 + int(25 * completed / max(total, 1))
            try:
                results[property_id] = future.result()
                job.log(f"[Hostnames] '{property_name}' done ({completed}/{total})", level="success", percent=percent)
            except Exception as error:
                results[property_id] = []
                job.log(f"[Hostnames] '{property_name}' failed ({completed}/{total}): {error}", level="error", percent=percent)

    job.log("Group 1/3 complete: hostnames fetched", level="success", percent=35)
    return results


def fetch_property_activation_summary(
    session: requests.Session, base_url: str, contract_id: str, group_id: str, prop: dict[str, Any], job: Job
) -> dict[str, dict[str, str]]:
    """Group #2: pull staging/production activation history for a single property."""
    property_id = prop.get("propertyId")
    if not property_id:
        return {}

    response = call_with_cooloff(
        job,
        f"fetching activations for property {property_id}",
        fetch_property_activations,
        session,
        base_url,
        property_id,
        contract_id,
        group_id,
    )
    if response.status_code != 200:
        return {}

    activation_items = response.json().get("activations", {}).get("items", [])
    return summarize_activations(activation_items)


def fetch_activations_stage(
    session: requests.Session, base_url: str, property_tasks: list[tuple[str, str, dict[str, Any]]], job: Job
) -> dict[str, dict[str, dict[str, str]]]:
    """Group #2: pull activations for every property in parallel, reporting progress as each completes."""
    total = len(property_tasks)
    job.log(f"Group 2/3: fetching activations for {total} properties...", percent=35)

    results: dict[str, dict[str, dict[str, str]]] = {}
    completed = 0

    with ThreadPoolExecutor(max_workers=PROPERTY_WORKER_COUNT) as executor:
        futures = {
            executor.submit(fetch_property_activation_summary, session, base_url, contract_id, group_id, prop, job): prop
            for contract_id, group_id, prop in property_tasks
        }
        for future in as_completed(futures):
            prop = futures[future]
            property_id = prop.get("propertyId")
            property_name = prop.get("propertyName", property_id)
            completed += 1
            percent = 35 + int(20 * completed / max(total, 1))
            try:
                results[property_id] = future.result()
                job.log(f"[Activations] '{property_name}' done ({completed}/{total})", level="success", percent=percent)
            except Exception as error:
                results[property_id] = {}
                job.log(f"[Activations] '{property_name}' failed ({completed}/{total}): {error}", level="error", percent=percent)

    job.log("Group 2/3 complete: activations fetched", level="success", percent=55)
    return results


def fetch_property_features(
    session: requests.Session, base_url: str, contract_id: str, group_id: str, prop: dict[str, Any], job: Job
) -> dict[str, list[str]]:
    """Group #3: pull the rule tree for a single property and extract behaviors + origin hostnames."""
    property_id = prop.get("propertyId")
    version = prop.get("latestVersion") or prop.get("productionVersion") or prop.get("stagingVersion")
    if not property_id or not version:
        return {"behaviors": [], "origins": []}

    response = call_with_cooloff(
        job,
        f"fetching rules for property {property_id}",
        fetch_property_rules,
        session,
        base_url,
        property_id,
        version,
        contract_id,
        group_id,
    )
    rules_root = response.json().get("rules", {}) if response.status_code == 200 else {}
    return {"behaviors": extract_behaviors(rules_root), "origins": extract_origin_hostnames(rules_root)}


def fetch_features_stage(
    session: requests.Session, base_url: str, property_tasks: list[tuple[str, str, dict[str, Any]]], job: Job
) -> dict[str, dict[str, list[str]]]:
    """Group #3: pull rule-tree behaviors/origins for every property in parallel, reporting progress as each completes."""
    total = len(property_tasks)
    job.log(f"Group 3/3: fetching feature behaviors for {total} properties...", percent=55)

    results: dict[str, dict[str, list[str]]] = {}
    completed = 0

    with ThreadPoolExecutor(max_workers=PROPERTY_WORKER_COUNT) as executor:
        futures = {
            executor.submit(fetch_property_features, session, base_url, contract_id, group_id, prop, job): prop
            for contract_id, group_id, prop in property_tasks
        }
        for future in as_completed(futures):
            prop = futures[future]
            property_id = prop.get("propertyId")
            property_name = prop.get("propertyName", property_id)
            completed += 1
            percent = 55 + int(20 * completed / max(total, 1))
            try:
                results[property_id] = future.result()
                job.log(f"[Features] '{property_name}' done ({completed}/{total})", level="success", percent=percent)
            except Exception as error:
                results[property_id] = {"behaviors": [], "origins": []}
                job.log(f"[Features] '{property_name}' failed ({completed}/{total}): {error}", level="error", percent=percent)

    job.log("Group 3/3 complete: feature behaviors fetched", level="success", percent=75)
    return results


def discover_properties(
    session: requests.Session, base_url: str, job: Job
) -> list[tuple[str, str, dict[str, Any]]]:
    """Walk every group/contract and list the distinct properties in the account."""
    job.log("Fetching Akamai groups...", percent=2)
    groups_response = call_with_cooloff(job, "fetching groups", fetch_papi_groups, session, base_url)
    if groups_response.status_code != 200:
        raise ValueError(f"PAPI groups request failed with status code {groups_response.status_code}")

    groups = groups_response.json().get("groups", {}).get("items", [])
    job.log(f"Fetched {len(groups)} groups successfully", level="success", percent=5)

    property_tasks: list[tuple[str, str, dict[str, Any]]] = []
    seen_properties: set[str] = set()

    for group in groups:
        group_id = group.get("groupId")
        for contract_id in group.get("contractIds", []) or []:
            properties_response = call_with_cooloff(
                job,
                f"fetching properties for group {group_id} / contract {contract_id}",
                fetch_papi_properties,
                session,
                base_url,
                contract_id,
                group_id,
            )
            if properties_response.status_code != 200:
                job.log(
                    f"Failed to fetch properties for group {group_id} / contract {contract_id}",
                    level="error",
                )
                continue

            for prop in properties_response.json().get("properties", {}).get("items", []):
                property_id = prop.get("propertyId")
                if not property_id or property_id in seen_properties:
                    continue
                seen_properties.add(property_id)
                property_tasks.append((contract_id, group_id, prop))

    job.log(f"Discovered {len(property_tasks)} properties across all groups/contracts", level="success", percent=10)
    return property_tasks


def build_feature_matrix(session: requests.Session, base_url: str, job: Job) -> list[dict[str, Any]]:
    """Discover every property, then fetch hostnames, activations and features as three separate parallel stages."""
    property_tasks = discover_properties(session, base_url, job)

    hostnames_by_property = fetch_hostnames_stage(session, base_url, property_tasks, job)
    activations_by_property = fetch_activations_stage(session, base_url, property_tasks, job)
    features_by_property = fetch_features_stage(session, base_url, property_tasks, job)

    job.log("Combining property results into feature matrix...", percent=76)
    rows: list[dict[str, Any]] = []

    for contract_id, group_id, prop in property_tasks:
        property_id = prop.get("propertyId")
        version = prop.get("latestVersion") or prop.get("productionVersion") or prop.get("stagingVersion")
        hostnames = hostnames_by_property.get(property_id) or [""]
        activation_summary = activations_by_property.get(property_id) or {}
        staging = activation_summary.get("STAGING", {})
        production = activation_summary.get("PRODUCTION", {})
        features = features_by_property.get(property_id) or {"behaviors": [], "origins": []}

        for hostname in hostnames:
            rows.append(
                {
                    "propertyId": property_id,
                    "propertyName": prop.get("propertyName", ""),
                    "contractId": contract_id,
                    "groupId": group_id,
                    "propertyVersion": version,
                    "hostname": hostname,
                    "originServers": ";".join(features["origins"]),
                    "behaviors": ";".join(features["behaviors"]),
                    "stagingActivatedAt": staging.get("updateDate", ""),
                    "stagingActivatedBy": staging.get("updatedByUser", ""),
                    "productionActivatedAt": production.get("updateDate", ""),
                    "productionActivatedBy": production.get("updatedByUser", ""),
                }
            )

    job.log("Feature matrix build complete", level="success", percent=78)
    return rows


def write_feature_matrix_csv(rows: list[dict[str, Any]]) -> Path:
    path = get_storage_dir() / "featureMatrix.csv"
    with path.open("w", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FEATURE_MATRIX_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def read_feature_matrix_csv() -> list[dict[str, str]]:
    path = get_storage_dir() / "featureMatrix.csv"
    if not path.exists():
        return []
    with path.open(newline="") as csv_file:
        return list(csv.DictReader(csv_file))


def resolve_hostname_cname_or_ip(hostname: str) -> dict[str, str]:
    """Resolve a hostname's CNAME via Google Public DNS, falling back to its A record."""
    try:
        cname_response = resolve_hostname_via_google_dns(hostname, "CNAME")
        cname_payload = cname_response.json() if cname_response.status_code == 200 else {}
        cname_answer = next((a for a in cname_payload.get("Answer") or [] if a.get("type") == 5), None)
        if cname_answer:
            return {"hostname": hostname, "resolvedValue": cname_answer.get("data", "").rstrip("."), "recordType": "CNAME"}

        a_response = resolve_hostname_via_google_dns(hostname, "A")
        a_payload = a_response.json() if a_response.status_code == 200 else {}
        a_answer = next((a for a in a_payload.get("Answer") or [] if a.get("type") == 1), None)
        if a_answer:
            return {"hostname": hostname, "resolvedValue": a_answer.get("data", ""), "recordType": "A"}

        return {"hostname": hostname, "resolvedValue": "", "recordType": "NONE"}
    except Exception:
        return {"hostname": hostname, "resolvedValue": "", "recordType": "ERROR"}


def resolve_hostnames_concurrent(hostnames: list[str], job: Job) -> list[dict[str, str]]:
    """Resolve every hostname's CNAME/A record concurrently via a thread pool, logging progress."""
    total = len(hostnames)
    job.log(f"Resolving DNS for {total} hostnames via Google Public DNS...", percent=80)

    results: list[dict[str, str]] = []
    completed = 0

    with ThreadPoolExecutor(max_workers=DNS_WORKER_COUNT) as executor:
        futures = {executor.submit(resolve_hostname_cname_or_ip, hostname): hostname for hostname in hostnames}
        for future in as_completed(futures):
            hostname = futures[future]
            completed += 1
            percent = 80 + int(17 * completed / max(total, 1))
            result = future.result()
            level = "success" if result["recordType"] in {"CNAME", "A"} else "warning"
            job.log(
                f"Resolved {hostname} -> {result['recordType']} ({completed}/{total})",
                level=level,
                percent=percent,
            )
            results.append(result)

    return results


def write_host2cname_csv(rows: list[dict[str, str]]) -> Path:
    path = get_storage_dir() / "host2cname.csv"
    with path.open("w", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=HOST2CNAME_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return path


CNAME_STATUS_RELATIVE_PATH = Path("REPORTS") / "CSVDATA" / "cname-status.csv"
CONFIG_SUMMARY_RELATIVE_PATH = Path("REPORTS") / "CSVDATA" / "config-summary.csv"
CSV_DATA_MODES = {"csv_data_remote"}


def get_ns_config() -> dict[str, str]:
    return {
        "hostname": os.getenv("NS_HOSTNAME", ""),
        "keyname": os.getenv("NS_KEYNAME", ""),
        "key": os.getenv("NS_KEY", ""),
        "cp_code": os.getenv("NS_CP_CODE", ""),
        "base_path": os.getenv("NS_BASE_PATH", ""),
    }


def download_csv_from_netstorage(remote_path: str, local_path: Path, job: Job | None = None) -> None:
    """Download a single report file from Akamai NetStorage into the local cache path.

    Credentials are read from NS_HOSTNAME/NS_KEYNAME/NS_KEY/NS_CP_CODE env vars (never hardcoded)."""
    try:
        from akamai.netstorage import Netstorage
    except ImportError as error:
        raise ValueError(
            "NetStorage SDK not installed; install the package that provides 'akamai.netstorage' to enable remote downloads"
        ) from error

    cfg = get_ns_config()
    missing = [name for name in ("hostname", "keyname", "key") if not cfg[name]]
    if missing:
        raise ValueError(
            f"Missing NetStorage credentials: {', '.join(missing)} (set NS_HOSTNAME/NS_KEYNAME/NS_KEY env vars)"
        )

    debug_context = (
        f"ns_hostname={cfg['hostname']!r} keyname={cfg['keyname']!r} cp_code={cfg['cp_code']!r} "
        f"remote_path={remote_path!r} local_path={local_path}"
    )

    if job:
        job.log(f"Downloading {remote_path} from NetStorage... [{debug_context}]", percent=20)

    netstorage = Netstorage(cfg["hostname"], cfg["keyname"], cfg["key"])
    local_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        ok, result = netstorage.download(remote_path, str(local_path))
    except ValueError:
        # Some SDK versions return a single value instead of an (ok, response) tuple.
        try:
            result = netstorage.download(remote_path, str(local_path))
            ok = None
        except Exception as error:
            raise ValueError(
                f"NetStorage download raised an error [{debug_context}]: {type(error).__name__}: {error}"
            ) from error
    except Exception as error:
        raise ValueError(
            f"NetStorage download raised an error [{debug_context}]: {type(error).__name__}: {error}"
        ) from error

    status_code = getattr(result, "status_code", None)
    reason = getattr(result, "reason", None)
    request_url = getattr(result, "url", None)
    headers = getattr(result, "headers", None)

    body_text: str | None = None
    try:
        text_attr = result.text
    except Exception:
        # The SDK streamed the response body directly to disk, so accessing
        # .text again can raise (e.g. requests.exceptions.StreamConsumedError).
        text_attr = None
    if isinstance(text_attr, str):
        body_text = text_attr
    elif text_attr is not None:
        body_text = str(text_attr)

    if job:
        job.log(
            f"NetStorage response: ok={ok}, status={status_code}, reason={reason!r}, url={request_url!r}",
            percent=30,
        )

    # The SDK's return value can be truthy even on failure (e.g. an HTTP response
    # object), so verify the file actually landed on disk before trusting it, and
    # surface as much detail from the response as possible for diagnosis.
    if not local_path.exists() or local_path.stat().st_size == 0:
        diagnostics = {
            "resultType": type(result).__name__,
            "ok": ok,
            "statusCode": status_code,
            "reason": reason,
            "requestUrl": request_url,
            "responseHeaders": dict(headers) if headers else None,
            "responseBodySnippet": body_text[:500] if body_text else None,
        }
        diagnostics_str = ", ".join(f"{k}={v!r}" for k, v in diagnostics.items() if v is not None)
        hint = ""
        if status_code == 404:
            hint = " Hint: 404 usually means the remote path or CP code is wrong."
        elif status_code == 403:
            hint = " Hint: 403 usually means invalid NetStorage credentials or ACL/upload-dir restriction."

        raise ValueError(
            f"NetStorage download did not produce a file at {local_path} for remote path {remote_path} "
            f"[{debug_context}]. Diagnostics: {diagnostics_str or 'no additional response details available'}.{hint}"
        )

    if job:
        job.log(
            f"Downloaded {remote_path} -> {local_path.name} ({local_path.stat().st_size} bytes)",
            level="success",
            percent=45,
        )


def resolve_report_csv_path(
    account_key: str, data_mode: str, relative_path: Path, job: Job | None = None, context: str | None = None
) -> Path:
    """Resolve a per-account report CSV path, always downloading a fresh copy from NetStorage.

    There is no local caching: every call re-downloads the file so the dashboard never shows
    stale data. `context`, when provided, overrides the NS_BASE_PATH env var for this request only."""
    if data_mode not in CSV_DATA_MODES:
        raise ValueError(f"Invalid data mode: {data_mode}. Expected one of {sorted(CSV_DATA_MODES)}")

    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    account_dir = account_metadata.get("csvAccountDir") or account_key
    account_relative_path = Path(account_dir) / relative_path
    local_path = get_storage_dir() / data_mode / account_relative_path

    cfg = get_ns_config()
    cp_code = cfg["cp_code"]
    base_path = context if context is not None and context.strip() else cfg["base_path"]
    if not cp_code and job:
        job.log(
            "NS_CP_CODE is not set; the remote path will have no CP-code prefix. "
            "If NetStorage requires one, set NS_CP_CODE.",
            level="warning",
        )
    if not base_path and job:
        job.log(
            "NS_BASE_PATH is not set; the remote path will have no base-path segment. "
            "If NetStorage requires one, set NS_BASE_PATH.",
            level="warning",
        )
    remote_path = "/" + "/".join(
        part for part in [cp_code, base_path, *account_relative_path.parts] if part
    )
    if job:
        job.log(
            f"Attempting NetStorage download: remote_path={remote_path!r}, "
            f"local_path={local_path}, cp_code={cp_code!r}, base_path={base_path!r}",
            percent=15,
        )
    download_csv_from_netstorage(remote_path, local_path, job)

    if not local_path.exists():
        raise FileNotFoundError(
            f"CSV report not found: {local_path} (data_mode={data_mode}, account_dir={account_dir}, "
            f"relative_path={relative_path})"
        )

    return local_path


ALL_ACCOUNTS_SUMMARY_RELATIVE_PATH = Path("allAccounts") / "all_accounts_summary.json"
ACCOUNT_MAPPING_RELATIVE_PATH = Path("allAccounts") / "account_mapping.json"


def resolve_ns_remote_path(relative_path: Path, context: str | None = None) -> tuple[str, str]:
    """Build a NetStorage remote path from CP code + base path (LIVE by default, or an archive context override)."""
    cfg = get_ns_config()
    base_path = context.strip().strip("/") if context and context.strip() else cfg["base_path"]
    remote_path = "/" + "/".join(part for part in [cfg["cp_code"], base_path, *relative_path.parts] if part)
    return remote_path, base_path


def download_ns_json(relative_path: Path, context: str | None = None) -> Any:
    """Download and parse a JSON file from NetStorage: LIVE by default, or an archive/<date> context override.

    Always downloads a fresh copy (no caching), reusing the generic NetStorage download used for CSV reports."""
    remote_path, base_path = resolve_ns_remote_path(relative_path, context)
    local_path = get_storage_dir() / "ns_json_cache" / (base_path or "live") / relative_path
    download_csv_from_netstorage(remote_path, local_path)
    return json.loads(local_path.read_text(encoding="utf-8"))


def is_archive_context(context: str | None) -> bool:
    return bool(context and context.strip())


def get_ns_summary_dashboard_data(context: str | None = None) -> dict[str, Any]:
    """Fetch all_accounts_summary.json from NetStorage: LIVE by default, or from the given archive context."""
    normalized_context = context.strip() if is_archive_context(context) else None
    try:
        data = download_ns_json(ALL_ACCOUNTS_SUMMARY_RELATIVE_PATH, normalized_context)
        return {
            "source": "netstorage-archive" if normalized_context else "netstorage-live",
            "context": normalized_context,
            "data": data,
        }
    except Exception as error:
        return {
            "source": "netstorage-error",
            "context": normalized_context,
            "data": None,
            "error": str(error),
        }


def get_ns_account_mapping() -> dict[str, Any]:
    """Fetch account_mapping.json from the LIVE NetStorage location, used to populate the account search widget."""
    try:
        payload = download_ns_json(ACCOUNT_MAPPING_RELATIVE_PATH, None)
        entries: list[dict[str, str]] = []
        if isinstance(payload, dict):
            for key, value in payload.items():
                if not isinstance(value, dict):
                    continue
                entries.append(
                    {
                        "accountName": str(value.get("accountName") or key),
                        "accountId": str(value.get("accountId") or key),
                        "csvAccountDir": str(value.get("csvAccountDir") or key),
                    }
                )
        return {"source": "netstorage-live", "data": entries}
    except Exception as error:
        return {"source": "netstorage-error", "data": [], "error": str(error)}


ARCHIVE_ROOT_DIR = "archive"

_NS_ARCHIVE_LIST_CACHE: dict[str, Any] = {"data": None, "loaded_at": 0.0}
_NS_ARCHIVE_LIST_CACHE_TTL_SECONDS = 60


def list_ns_archive_folders() -> list[str]:
    """List the CPCODE/archive directory on NetStorage and return archive folder names (e.g.
    "archive/20260901"), newest first. Used to populate the archive(s) dropdown/search widget.

    Uses the "dir" action (not "stat"): archive/<date> directories are implicit (inferred from
    child object paths, with no directory marker object of their own), and NetStorage's "stat"
    action 404s on implicit directories. "dir" lists a directory's children by prefix and works
    for implicit directories too."""
    try:
        from akamai.netstorage import Netstorage
    except ImportError as error:
        raise ValueError(
            "NetStorage SDK not installed; install the package that provides 'akamai.netstorage' to list archives"
        ) from error

    cfg = get_ns_config()
    missing = [name for name in ("hostname", "keyname", "key") if not cfg[name]]
    if missing:
        raise ValueError(
            f"Missing NetStorage credentials: {', '.join(missing)} (set NS_HOSTNAME/NS_KEYNAME/NS_KEY env vars)"
        )

    remote_dir = "/" + "/".join(part for part in [cfg["cp_code"], ARCHIVE_ROOT_DIR] if part)
    netstorage = Netstorage(cfg["hostname"], cfg["keyname"], cfg["key"])

    try:
        ok, response = netstorage.dir(remote_dir)
    except Exception as error:
        raise ValueError(
            f"NetStorage dir raised an error for {remote_dir!r}: {type(error).__name__}: {error}"
        ) from error

    status_code = getattr(response, "status_code", None)
    if not ok or status_code != 200:
        reason = getattr(response, "reason", None)
        raise ValueError(f"NetStorage dir failed for {remote_dir!r}: status={status_code}, reason={reason!r}")

    try:
        root = ET.fromstring(response.text)
    except ET.ParseError as error:
        raise ValueError(f"NetStorage dir returned unparseable XML for {remote_dir!r}: {error}") from error

    folders = [
        f"{ARCHIVE_ROOT_DIR}/{file_element.get('name')}"
        for file_element in root.findall("file")
        if file_element.get("type") == "dir" and file_element.get("name")
    ]
    return sorted(folders, reverse=True)


def get_ns_archive_list() -> dict[str, Any]:
    """Cached (60s) list of archive/<date> folders for the archive picker UI, always LIVE from NetStorage."""
    now = time.time()
    cached = _NS_ARCHIVE_LIST_CACHE["data"]
    if cached is not None and (now - _NS_ARCHIVE_LIST_CACHE["loaded_at"]) < _NS_ARCHIVE_LIST_CACHE_TTL_SECONDS:
        return {"source": "netstorage-live", "data": cached}

    try:
        folders = list_ns_archive_folders()
        _NS_ARCHIVE_LIST_CACHE["data"] = folders
        _NS_ARCHIVE_LIST_CACHE["loaded_at"] = now
        return {"source": "netstorage-live", "data": folders}
    except Exception as error:
        return {"source": "netstorage-error", "data": cached or [], "error": str(error)}


def get_ns_account_dashboard_data(account_key: str, context: str | None = None) -> dict[str, Any]:
    """Fetch account_<csvAccountDir>_summary.json from NetStorage: LIVE by default, or from the given archive context."""
    normalized_context = context.strip() if is_archive_context(context) else None
    try:
        mapping = load_account_id_map()
        account_metadata = mapping.get(account_key)
        if not account_metadata:
            raise ValueError(f"No mapping found for account key: {account_key}")
        csv_account_dir = account_metadata.get("csvAccountDir") or account_key
        relative_path = Path(csv_account_dir) / f"account_{csv_account_dir}_summary.json"
        data = download_ns_json(relative_path, normalized_context)
        return {
            "source": "netstorage-archive" if normalized_context else "netstorage-live",
            "context": normalized_context,
            "data": data,
        }
    except Exception as error:
        return {
            "source": "netstorage-error",
            "context": normalized_context,
            "data": None,
            "error": str(error),
        }


def read_csv_as_json(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    """Read a CSV file, preserving its header row as the JSON column names."""
    with path.open(newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        columns = list(reader.fieldnames or [])
        rows = [dict(row) for row in reader]
    return columns, rows


def is_hostname_covered(row: dict[str, str]) -> bool:
    """A hostname is considered covered when it has a non-empty, non-placeholder cnameTo value."""
    cname_to = (row.get("cnameTo") or "").strip()
    return bool(cname_to) and cname_to != "-"


def get_account_hostname_cname_matrix(
    account_key: str, data_mode: str, job: Job, context: str | None = None
) -> dict[str, Any]:
    """Build the hostname/CNAME matrix for an account from the config-summary.csv report."""
    job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    job.log(f"Resolving config-summary.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, CONFIG_SUMMARY_RELATIVE_PATH, job, context)

    job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)

    hostnames = sorted({row.get("hostname", "") for row in rows if row.get("hostname")})

    job.log("Hostname CNAME matrix ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "hostnames": hostnames,
        "rows": rows,
        "totals": {"rows": len(rows), "hostnames": len(hostnames)},
    }


def get_account_hostname_cname_matrix_summary(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Summarize the config-summary.csv report: covered/not-covered totals plus a per-column value breakdown."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving config-summary.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, CONFIG_SUMMARY_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)

    if job:
        job.log("Computing summary breakdowns...", percent=80)
    total_rows = len(rows)
    hostnames = sorted({row.get("hostname", "") for row in rows if row.get("hostname")})
    covered_count = sum(1 for row in rows if is_hostname_covered(row))
    not_covered_count = total_rows - covered_count

    breakdowns: dict[str, list[dict[str, Any]]] = {}
    for column in columns:
        value_counts: dict[str, int] = {}
        for row in rows:
            value = (row.get(column) or "").strip() or "(blank)"
            value_counts[value] = value_counts.get(value, 0) + 1
        breakdowns[column] = [
            {"value": value, "count": count}
            for value, count in sorted(value_counts.items(), key=lambda item: item[1], reverse=True)
        ]

    if job:
        job.log("Hostname CNAME matrix summary ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "totals": {
            "rows": total_rows,
            "hostnames": len(hostnames),
            "covered": covered_count,
            "notCovered": not_covered_count,
        },
        "breakdowns": breakdowns,
    }


CONFIG_AUDIT_RELATIVE_PATH = Path("REPORTS") / "CSVDATA" / "config-audit.csv"

# Every other column in config-audit.csv is treated as a feature toggle/setting.
FEATURE_MATRIX_BASE_COLUMNS = [
    "propertyName",
    "propertyVersion",
    "productionStatus",
    "stagingStatus",
    "contractId",
    "propertyId",
    "ruleFormat",
    "securityOptions",
]
FEATURE_MATRIX_BASE_COLUMN_SET = set(FEATURE_MATRIX_BASE_COLUMNS)
FEATURE_MATRIX_ABSENT_VALUES = {"false", "disabled", "none", "n/a", "-"}


def get_feature_matrix_columns(columns: list[str]) -> list[str]:
    """Every config-audit.csv column that isn't a base property attribute is a feature."""
    return [column for column in columns if column not in FEATURE_MATRIX_BASE_COLUMN_SET]


def is_feature_value_present(raw_value: str | None) -> bool:
    """A feature is considered enabled/present when its cell is non-blank and not an explicit off value."""
    value = (raw_value or "").strip()
    if not value:
        return False
    return value.lower() not in FEATURE_MATRIX_ABSENT_VALUES


def get_account_feature_matrix(
    account_key: str, data_mode: str, job: Job, context: str | None = None
) -> dict[str, Any]:
    """Build the property/feature matrix for an account from the config-audit.csv report."""
    job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    job.log(f"Resolving config-audit.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, CONFIG_AUDIT_RELATIVE_PATH, job, context)

    job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    feature_columns = get_feature_matrix_columns(columns)
    properties = sorted({row.get("propertyName", "") for row in rows if row.get("propertyName")})

    job.log("Feature matrix ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "baseColumns": [column for column in FEATURE_MATRIX_BASE_COLUMNS if column in columns],
        "featureColumns": feature_columns,
        "properties": properties,
        "rows": rows,
        "totals": {"rows": len(rows), "properties": len(properties), "features": len(feature_columns)},
    }


def get_account_feature_matrix_summary(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Summarize config-audit.csv: overall feature adoption plus an enabled/disabled breakdown per feature."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving config-audit.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, CONFIG_AUDIT_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    feature_columns = get_feature_matrix_columns(columns)
    properties = sorted({row.get("propertyName", "") for row in rows if row.get("propertyName")})

    if job:
        job.log("Computing feature adoption breakdowns...", percent=80)
    total_rows = len(rows)
    breakdowns: dict[str, list[dict[str, Any]]] = {}
    overall_enabled = 0
    for column in feature_columns:
        enabled_count = sum(1 for row in rows if is_feature_value_present(row.get(column)))
        disabled_count = total_rows - enabled_count
        overall_enabled += enabled_count
        breakdowns[column] = [
            {"value": "Enabled", "count": enabled_count},
            {"value": "Disabled", "count": disabled_count},
        ]
    overall_total_cells = total_rows * len(feature_columns)
    overall_disabled = overall_total_cells - overall_enabled

    if job:
        job.log("Feature matrix summary ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "featureColumns": feature_columns,
        "totals": {
            "rows": total_rows,
            "properties": len(properties),
            "features": len(feature_columns),
            "enabled": overall_enabled,
            "disabled": overall_disabled,
        },
        "breakdowns": breakdowns,
    }


def get_account_feature_matrix_scorecard(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Build the featureMatrix scoreCard JSON: per-feature count and the properties that have it set."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving config-audit.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, CONFIG_AUDIT_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    feature_columns = get_feature_matrix_columns(columns)
    properties = sorted({row.get("propertyName", "") for row in rows if row.get("propertyName")})

    if job:
        job.log("Building scoreCard...", percent=80)
    feature_matrix: list[dict[str, Any]] = []
    for column in feature_columns:
        property_entries = [
            {"propertyName": row.get("propertyName", ""), "status": (row.get(column) or "").strip()}
            for row in rows
            if (row.get(column) or "").strip()
        ]
        feature_matrix.append(
            {"featureName": column, "count": len(property_entries), "properties": property_entries}
        )

    if job:
        job.log("Feature matrix scoreCard ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "featureMatrix": feature_matrix,
        "totals": {"properties": len(properties), "features": len(feature_columns)},
    }


HOSTNAME_COVERAGE_RELATIVE_PATH = Path("REPORTS") / "CSVDATA" / "hostname-coverage.csv"

# Base identity columns; every other column in hostname-coverage.csv is a security metric
# (e.g. Attack Groups in Alert/Deny, BMP/BMS/Custom Rules/Rate Policies/Reputation Categories counts).
SEC_HOST_COVERAGE_BASE_COLUMNS = [
    "hostname",
    "status",
    "configId",
    "configName",
    "configVersion",
    "contract",
    "hasMatchTarget",
    "policyNames",
    "policyIds",
]
SEC_HOST_COVERAGE_BASE_COLUMN_SET = set(SEC_HOST_COVERAGE_BASE_COLUMNS)


def get_sec_host_coverage_metric_columns(columns: list[str]) -> list[str]:
    """Every hostname-coverage.csv column that isn't a base identity attribute is a security metric."""
    return [column for column in columns if column not in SEC_HOST_COVERAGE_BASE_COLUMN_SET]


def is_sec_host_covered(row: dict[str, str]) -> bool:
    """A hostname is considered covered when its status column is exactly 'covered'."""
    return (row.get("status") or "").strip().lower() == "covered"


def get_account_sec_host_coverage_matrix(
    account_key: str, data_mode: str, job: Job, context: str | None = None
) -> dict[str, Any]:
    """Build the security hostname coverage matrix for an account from the hostname-coverage.csv report."""
    job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    job.log(f"Resolving hostname-coverage.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, HOSTNAME_COVERAGE_RELATIVE_PATH, job, context)

    job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    metric_columns = get_sec_host_coverage_metric_columns(columns)
    hostnames = sorted({row.get("hostname", "") for row in rows if row.get("hostname")})
    config_names = sorted({row.get("configName", "") for row in rows if row.get("configName")})
    covered_count = sum(1 for row in rows if is_sec_host_covered(row))

    job.log("Security host coverage matrix ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "baseColumns": [column for column in SEC_HOST_COVERAGE_BASE_COLUMNS if column in columns],
        "metricColumns": metric_columns,
        "hostnames": hostnames,
        "configNames": config_names,
        "rows": rows,
        "totals": {
            "rows": len(rows),
            "hostnames": len(hostnames),
            "configNames": len(config_names),
            "covered": covered_count,
            "notCovered": len(rows) - covered_count,
        },
    }


def get_account_sec_host_coverage_matrix_summary(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Summarize hostname-coverage.csv: covered/not-covered totals, per-column breakdowns, and security metric totals
    (e.g. Attack Groups in Alert (Count) / Attack Groups in Deny (Count))."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving hostname-coverage.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, HOSTNAME_COVERAGE_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    metric_columns = get_sec_host_coverage_metric_columns(columns)
    total_rows = len(rows)
    hostnames = sorted({row.get("hostname", "") for row in rows if row.get("hostname")})
    covered_count = sum(1 for row in rows if is_sec_host_covered(row))
    not_covered_count = total_rows - covered_count

    if job:
        job.log("Computing coverage breakdowns...", percent=80)
    breakdowns: dict[str, list[dict[str, Any]]] = {}
    for column in columns:
        value_counts: dict[str, int] = {}
        for row in rows:
            value = (row.get(column) or "").strip() or "(blank)"
            value_counts[value] = value_counts.get(value, 0) + 1
        breakdowns[column] = [
            {"value": value, "count": count}
            for value, count in sorted(value_counts.items(), key=lambda item: item[1], reverse=True)
        ]

    metric_totals = {column: sum(to_float(row.get(column)) for row in rows) for column in metric_columns}

    if job:
        job.log("Security host coverage matrix summary ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "metricColumns": metric_columns,
        "totals": {
            "rows": total_rows,
            "hostnames": len(hostnames),
            "covered": covered_count,
            "notCovered": not_covered_count,
        },
        "breakdowns": breakdowns,
        "metricTotals": metric_totals,
    }


def get_account_sec_host_coverage_matrix_scorecard(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Build the secHostCoverageMatrix scoreCard JSON: one entry per unique configName with a hostname count plus
    the hostnames that have Attack Groups in Alert / Attack Groups in Deny for that config."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving hostname-coverage.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, HOSTNAME_COVERAGE_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    _columns, rows = read_csv_as_json(csv_path)

    if job:
        job.log("Building scoreCard...", percent=80)
    groups: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        config_name = (row.get("configName") or "").strip() or "(Not Covered)"
        groups.setdefault(config_name, []).append(row)

    sec_host_coverage_matrix: list[dict[str, Any]] = []
    for config_name, group_rows in sorted(groups.items(), key=lambda item: item[0].lower()):
        attack_group_alert = [
            {"hostname": row.get("hostname", ""), "status": (row.get("Attack Groups in Alert") or "").strip()}
            for row in group_rows
            if to_float(row.get("Attack Groups in Alert")) > 0
        ]
        attack_group_deny = [
            {"hostname": row.get("hostname", ""), "status": (row.get("Attack Groups in Deny") or "").strip()}
            for row in group_rows
            if to_float(row.get("Attack Groups in Deny")) > 0
        ]
        sec_host_coverage_matrix.append(
            {
                "configName": config_name,
                "count": len(group_rows),
                "attackGroupAlert": attack_group_alert,
                "attackGroupDeny": attack_group_deny,
            }
        )

    if job:
        job.log("Security host coverage matrix scoreCard ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "secHostCoverageMatrix": sec_host_coverage_matrix,
        "totals": {"hostnames": len(rows), "configNames": len(sec_host_coverage_matrix)},
    }


TRAFFIC_REPORT_RELATIVE_PATH = Path("REPORTS") / "CSVDATA" / "traffic-report-hits-by-hostname.csv"

# Raw CSV header -> short metric key used in totals/scoreCard output.
TRAFFIC_MATRIX_METRIC_KEYS = {
    "edgeHits (7days)": "edgeHits",
    "originHits (7days)": "originHits",
    "edgeBytes (7days)": "edgeBytes",
    "originBytes (7days)": "originBytes",
    "hitsOffload (7days)": "hitsOffload",
    "bytesOffload (7days)": "bytesOffload",
}


def to_float(raw_value: str | None) -> float:
    try:
        return float(raw_value) if raw_value not in (None, "") else 0.0
    except ValueError:
        return 0.0


def get_account_traffic_matrix(
    account_key: str, data_mode: str, job: Job, context: str | None = None
) -> dict[str, Any]:
    """Build the hostname traffic matrix for an account from the traffic-report-hits-by-hostname.csv report."""
    job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    job.log(f"Resolving traffic-report-hits-by-hostname.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, TRAFFIC_REPORT_RELATIVE_PATH, job, context)

    job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    metric_columns = [column for column in columns if column in TRAFFIC_MATRIX_METRIC_KEYS]
    base_columns = [column for column in columns if column not in TRAFFIC_MATRIX_METRIC_KEYS]
    hostnames = sorted({row.get("hostname", "") for row in rows if row.get("hostname")})

    job.log("Traffic matrix ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "baseColumns": base_columns,
        "metricColumns": metric_columns,
        "hostnames": hostnames,
        "rows": rows,
        "totals": {"rows": len(rows), "hostnames": len(hostnames)},
    }


def get_account_traffic_matrix_summary(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Summarize traffic-report-hits-by-hostname.csv: totals per metric plus top-hostname breakdowns."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving traffic-report-hits-by-hostname.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, TRAFFIC_REPORT_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    metric_columns = [column for column in columns if column in TRAFFIC_MATRIX_METRIC_KEYS]
    hostnames = sorted({row.get("hostname", "") for row in rows if row.get("hostname")})

    if job:
        job.log("Computing traffic totals and breakdowns...", percent=80)
    totals: dict[str, Any] = {"hostnames": len(hostnames)}
    breakdowns: dict[str, list[dict[str, Any]]] = {}
    for column in metric_columns:
        metric_key = TRAFFIC_MATRIX_METRIC_KEYS[column]
        values = [(row.get("hostname", ""), to_float(row.get(column))) for row in rows]
        totals[metric_key] = sum(value for _, value in values)

        top_values = sorted(values, key=lambda item: item[1], reverse=True)[:10]
        other_total = sum(value for _, value in values) - sum(value for _, value in top_values)
        breakdown = [{"value": hostname, "count": value} for hostname, value in top_values]
        if len(values) > len(top_values) and other_total > 0:
            breakdown.append({"value": "Other", "count": other_total})
        breakdowns[metric_key] = breakdown

    if job:
        job.log("Traffic matrix summary ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "metricColumns": [TRAFFIC_MATRIX_METRIC_KEYS[column] for column in metric_columns],
        "totals": totals,
        "breakdowns": breakdowns,
    }


def get_account_traffic_matrix_scorecard(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Build the trafficMatrix scoreCard JSON: overall totals plus a per-hostname metric breakdown."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving traffic-report-hits-by-hostname.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, TRAFFIC_REPORT_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    metric_columns = [column for column in columns if column in TRAFFIC_MATRIX_METRIC_KEYS]

    if job:
        job.log("Building scoreCard...", percent=80)
    totals: dict[str, Any] = {"hostnames": 0}
    for column in metric_columns:
        totals[TRAFFIC_MATRIX_METRIC_KEYS[column]] = 0.0

    hostname_entries: list[dict[str, Any]] = []
    seen_hostnames: set[str] = set()
    for row in rows:
        hostname = row.get("hostname", "")
        if not hostname or hostname in seen_hostnames:
            continue
        seen_hostnames.add(hostname)
        entry: dict[str, Any] = {"hostname": hostname}
        for column in metric_columns:
            metric_key = TRAFFIC_MATRIX_METRIC_KEYS[column]
            value = to_float(row.get(column))
            entry[metric_key] = value
            totals[metric_key] += value
        hostname_entries.append(entry)
    totals["hostnames"] = len(hostname_entries)

    if job:
        job.log("Traffic matrix scoreCard ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "totals": totals,
        "hostnames": hostname_entries,
    }


def get_server_mode() -> str:
    return (os.getenv("SERVER_DATA_MODE") or "mock").lower()


# ----------------------------------------------------------------------------
# perfMatrix: Core Web Vitals per config-summary.csv hostname, via CrUX (with a
# PageSpeed Insights fallback for origins with no CrUX field data).
# ----------------------------------------------------------------------------

CRUX_METRICS = ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"]

# web.dev Core Web Vitals thresholds: (good upper bound, needs-improvement upper bound).
CWV_THRESHOLDS: dict[str, tuple[float, float]] = {
    "lcpMs": (2500, 4000),
    "inpMs": (200, 500),
    "cls": (0.1, 0.25),
}

PERF_MATRIX_WORKER_COUNT = int(os.getenv("PERF_MATRIX_WORKERS") or 5)


def get_crux_config() -> dict[str, str]:
    return {"api_key": os.getenv("CRUX_API_KEY", "")}


def get_grover_config() -> dict[str, str]:
    return {"api_key": os.getenv("X_API_KEY", "")}


def classify_cwv(metric_key: str, value: float | None) -> str | None:
    if value is None:
        return None
    good_max, needs_improvement_max = CWV_THRESHOLDS[metric_key]
    if value <= good_max:
        return "good"
    if value <= needs_improvement_max:
        return "needs-improvement"
    return "poor"


@sleep_and_retry
@limits(calls=int(os.getenv("CRUX_RATE_LIMIT_CALLS") or 100), period=60)
def fetch_crux_record(session: requests.Session, hostname: str, api_key: str) -> requests.Response:
    """Current (rolling 28-day) CrUX field data snapshot for an origin."""
    url = "https://chromeuxreport.googleapis.com/v1/records:queryRecord"
    payload = {"origin": f"https://{hostname}", "metrics": CRUX_METRICS}
    return session.post(url, params={"key": api_key}, json=payload, timeout=15)


@sleep_and_retry
@limits(calls=int(os.getenv("CRUX_RATE_LIMIT_CALLS") or 100), period=60)
def fetch_crux_history_record(session: requests.Session, hostname: str, api_key: str) -> requests.Response:
    """Historical progression of 28-day CrUX snapshots (weekly cadence) for an origin."""
    url = "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord"
    payload = {"origin": f"https://{hostname}", "metrics": CRUX_METRICS}
    return session.post(url, params={"key": api_key}, json=payload, timeout=15)


@sleep_and_retry
@limits(calls=int(os.getenv("PSI_RATE_LIMIT_CALLS") or 10), period=60)
def fetch_pagespeed_insights(session: requests.Session, hostname: str, api_key: str) -> requests.Response:
    """Synthetic Lighthouse lab-data fallback for origins with no CrUX field data."""
    url = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
    target_url = hostname if hostname.startswith("http") else f"https://{hostname}"
    params = {"url": target_url, "key": api_key, "strategy": "mobile", "category": "performance"}
    return session.get(url, params=params, timeout=90)


def _coerce_metric_value(value: Any) -> float | None:
    """CrUX returns most percentiles as numbers, but CLS as a string (e.g. "0.05") - normalize both."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def extract_current_cwv_from_crux(record: dict[str, Any]) -> dict[str, float | None]:
    metrics = record.get("metrics", {})
    return {
        "lcpMs": _coerce_metric_value(metrics.get("largest_contentful_paint", {}).get("percentiles", {}).get("p75")),
        "inpMs": _coerce_metric_value(metrics.get("interaction_to_next_paint", {}).get("percentiles", {}).get("p75")),
        "cls": _coerce_metric_value(metrics.get("cumulative_layout_shift", {}).get("percentiles", {}).get("p75")),
    }


def extract_cwv_history_from_crux(record: dict[str, Any]) -> list[dict[str, Any]]:
    """Zip CrUX history's per-metric percentile timeseries with their collection periods."""
    metrics = record.get("metrics", {})
    periods = record.get("collectionPeriods", [])
    lcp_series = metrics.get("largest_contentful_paint", {}).get("percentilesTimeseries", {}).get("p75s", [])
    inp_series = metrics.get("interaction_to_next_paint", {}).get("percentilesTimeseries", {}).get("p75s", [])
    cls_series = metrics.get("cumulative_layout_shift", {}).get("percentilesTimeseries", {}).get("p75s", [])

    history: list[dict[str, Any]] = []
    for index, period in enumerate(periods):
        last_date = period.get("lastDate", {})
        year, month, day = last_date.get("year"), last_date.get("month"), last_date.get("day")
        label = f"{year:04d}-{month:02d}-{day:02d}" if year and month and day else str(index)
        history.append(
            {
                "period": label,
                "lcpMs": _coerce_metric_value(lcp_series[index]) if index < len(lcp_series) else None,
                "inpMs": _coerce_metric_value(inp_series[index]) if index < len(inp_series) else None,
                "cls": _coerce_metric_value(cls_series[index]) if index < len(cls_series) else None,
            }
        )
    return history


def get_hostname_core_web_vitals(session: requests.Session, hostname: str, api_key: str) -> dict[str, Any]:
    """Fetch current + historical Core Web Vitals for a hostname: CrUX first, PageSpeed Insights on 404."""
    result: dict[str, Any] = {
        "hostname": hostname,
        "source": None,
        "available": False,
        "lcpMs": None,
        "inpMs": None,
        "cls": None,
        "lcpRating": None,
        "inpRating": None,
        "clsRating": None,
        "history": [],
        "error": None,
    }
    if not api_key:
        result["error"] = "CRUX_API_KEY not configured"
        return result

    try:
        current_response = fetch_crux_record(session, hostname, api_key)
    except requests.exceptions.RequestException as error:
        result["error"] = f"CrUX request failed: {error}"
        return result

    if current_response.status_code == 200:
        record = current_response.json().get("record", {})
        result.update(extract_current_cwv_from_crux(record))
        result["source"] = "crux"
        result["available"] = True

        try:
            history_response = fetch_crux_history_record(session, hostname, api_key)
            if history_response.status_code == 200:
                result["history"] = extract_cwv_history_from_crux(history_response.json().get("record", {}))
        except requests.exceptions.RequestException:
            pass  # History is best-effort; the current snapshot metrics above still stand.

    elif current_response.status_code == 404:
        try:
            psi_response = fetch_pagespeed_insights(session, hostname, api_key)
        except requests.exceptions.RequestException as error:
            result["error"] = f"PageSpeed Insights request failed: {error}"
            psi_response = None

        if psi_response is not None and psi_response.status_code == 200:
            audits = psi_response.json().get("lighthouseResult", {}).get("audits", {})
            result["lcpMs"] = _coerce_metric_value(audits.get("largest-contentful-paint", {}).get("numericValue"))
            result["cls"] = _coerce_metric_value(audits.get("cumulative-layout-shift", {}).get("numericValue"))
            # PSI lab runs have no INP equivalent; Total Blocking Time is the closest lab proxy.
            result["inpMs"] = _coerce_metric_value(audits.get("total-blocking-time", {}).get("numericValue"))
            result["source"] = "pagespeed"
            result["available"] = True
        elif not result["error"]:
            result["error"] = "No CrUX field data and PageSpeed Insights fallback unavailable"
    else:
        result["error"] = f"CrUX API error {current_response.status_code}"

    result["lcpRating"] = classify_cwv("lcpMs", result["lcpMs"])
    result["inpRating"] = classify_cwv("inpMs", result["inpMs"])
    result["clsRating"] = classify_cwv("cls", result["cls"])
    return result


def _fetch_core_web_vitals_for_hostnames(
    hostnames: list[str], job: Job | None = None, start_percent: int = 15, end_percent: int = 85
) -> dict[str, dict[str, Any]]:
    """Shared helper: fetch CrUX/PSI Core Web Vitals concurrently for a fixed list of hostnames."""
    cfg = get_crux_config()
    if job and not cfg["api_key"]:
        job.log(
            "CRUX_API_KEY is not set in .env.server; Core Web Vitals will be unavailable for all hostnames",
            level="warning",
            percent=start_percent,
        )

    session = requests.Session()
    perf_by_hostname: dict[str, dict[str, Any]] = {}
    completed = 0
    total = len(hostnames) or 1
    percent_span = max(end_percent - start_percent, 0)

    with ThreadPoolExecutor(max_workers=PERF_MATRIX_WORKER_COUNT) as executor:
        futures = {
            executor.submit(get_hostname_core_web_vitals, session, hostname, cfg["api_key"]): hostname
            for hostname in hostnames
        }
        for future in as_completed(futures):
            hostname = futures[future]
            try:
                perf = future.result()
            except Exception as error:
                perf = {
                    "hostname": hostname,
                    "source": None,
                    "available": False,
                    "lcpMs": None,
                    "inpMs": None,
                    "cls": None,
                    "lcpRating": None,
                    "inpRating": None,
                    "clsRating": None,
                    "history": [],
                    "error": str(error),
                }
            perf_by_hostname[hostname] = perf
            completed += 1
            if job:
                percent = start_percent + int(percent_span * completed / total)
                status = "available" if perf["available"] else f"unavailable ({perf.get('error') or 'no data'})"
                job.log(
                    f"[{completed}/{total}] {hostname}: {status}",
                    level="success" if perf["available"] else "warning",
                    percent=percent,
                )

    return perf_by_hostname


def _format_metric_value(value: float | None) -> str:
    return "" if value is None else str(value)


PERF_MATRIX_METRIC_COLUMNS = ["source", "lcpMs", "inpMs", "cls", "lcpRating", "inpRating", "clsRating"]
PERF_MATRIX_TOPN_COUNT = int(os.getenv("PERF_MATRIX_TOPN_COUNT") or 10)


# ----------------------------------------------------------------------------
# perfMatrixTopN: same Core Web Vitals pipeline as perfMatrix, but scoped to only
# the top N hostnames by edgeHits from traffic-report-hits-by-hostname.csv, since
# live CrUX/PageSpeed lookups are too costly to run across every hostname.
# ----------------------------------------------------------------------------


def _collect_account_perf_topn_data(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Shared helper: pick the top N hostnames by edgeHits from traffic-report-hits-by-hostname.csv
    and fetch CrUX/PSI Core Web Vitals only for those."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving traffic-report-hits-by-hostname.csv location ({data_mode})...", percent=5)
    csv_path = resolve_report_csv_path(account_key, data_mode, TRAFFIC_REPORT_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=10)
    columns, rows = read_csv_as_json(csv_path)
    edge_hits_column = next((column for column in columns if column.strip().lower().startswith("edgehits")), None)

    seen_hostnames: set[str] = set()
    unique_rows: list[dict[str, str]] = []
    for row in rows:
        hostname = row.get("hostname", "")
        if not hostname or hostname in seen_hostnames:
            continue
        seen_hostnames.add(hostname)
        unique_rows.append(row)

    sort_key = (lambda row: to_float(row.get(edge_hits_column))) if edge_hits_column else (lambda row: 0.0)
    top_rows = sorted(unique_rows, key=sort_key, reverse=True)[:PERF_MATRIX_TOPN_COUNT]
    top_hostnames = [row.get("hostname", "") for row in top_rows]

    if job:
        job.log(
            f"Selected top {len(top_hostnames)} of {len(unique_rows)} hostnames by edgeHits for "
            "live CrUX/PageSpeed lookups (see PERF_MATRIX_TOPN_COUNT)",
            percent=12,
        )

    perf_by_hostname = _fetch_core_web_vitals_for_hostnames(top_hostnames, job)

    return {
        "account_metadata": account_metadata,
        "columns": columns,
        "top_rows": top_rows,
        "hostnames": top_hostnames,
        "total_hostnames": len(unique_rows),
        "perf_by_hostname": perf_by_hostname,
    }


def get_account_perf_matrix_topn(
    account_key: str, data_mode: str, job: Job, context: str | None = None
) -> dict[str, Any]:
    """Build the Core Web Vitals table for only the top-N-by-traffic hostnames."""
    collected = _collect_account_perf_topn_data(account_key, data_mode, job, context)
    account_metadata = collected["account_metadata"]
    columns = collected["columns"]
    perf_by_hostname = collected["perf_by_hostname"]

    rows_out: list[dict[str, str]] = []
    for row in collected["top_rows"]:
        perf = perf_by_hostname.get(row.get("hostname", ""))
        enriched = dict(row)
        if perf:
            enriched.update(
                {
                    "source": perf["source"] or "",
                    "lcpMs": _format_metric_value(perf["lcpMs"]),
                    "inpMs": _format_metric_value(perf["inpMs"]),
                    "cls": _format_metric_value(perf["cls"]),
                    "lcpRating": perf["lcpRating"] or "",
                    "inpRating": perf["inpRating"] or "",
                    "clsRating": perf["clsRating"] or "",
                }
            )
        else:
            enriched.update({column: "" for column in PERF_MATRIX_METRIC_COLUMNS})
        rows_out.append(enriched)

    series = {hostname: perf["history"] for hostname, perf in perf_by_hostname.items()}
    available_count = sum(1 for perf in perf_by_hostname.values() if perf["available"])

    job.log("Perf matrix (Top N) ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns + PERF_MATRIX_METRIC_COLUMNS,
        "baseColumns": columns,
        "metricColumns": PERF_MATRIX_METRIC_COLUMNS,
        "hostnames": collected["hostnames"],
        "rows": rows_out,
        "series": series,
        "totals": {
            "hostnames": collected["total_hostnames"],
            "topN": len(collected["hostnames"]),
            "available": available_count,
            "unavailable": len(collected["hostnames"]) - available_count,
        },
    }


def get_account_perf_matrix_topn_summary(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Summarize Core Web Vitals for the top-N-by-traffic hostnames: availability + rating breakdowns."""
    collected = _collect_account_perf_topn_data(account_key, data_mode, job, context)
    account_metadata = collected["account_metadata"]
    perf_by_hostname = collected["perf_by_hostname"]
    perf_values = list(perf_by_hostname.values())

    if job:
        job.log("Computing Core Web Vitals summary...", percent=90)

    available = [perf for perf in perf_values if perf["available"]]

    def average(metric_key: str) -> float | None:
        values = [perf[metric_key] for perf in available if perf.get(metric_key) is not None]
        return round(sum(values) / len(values), 2) if values else None

    totals = {
        "hostnames": collected["total_hostnames"],
        "topN": len(collected["hostnames"]),
        "available": len(available),
        "unavailable": len(perf_values) - len(available),
        "lcpMsAvg": average("lcpMs"),
        "inpMsAvg": average("inpMs"),
        "clsAvg": average("cls"),
    }

    rating_labels = ["good", "needs-improvement", "poor"]
    breakdowns: dict[str, list[dict[str, Any]]] = {}
    for metric_key, rating_key in (("lcpMs", "lcpRating"), ("inpMs", "inpRating"), ("cls", "clsRating")):
        counts = {label: 0 for label in rating_labels}
        unavailable_count = 0
        for perf in perf_values:
            rating = perf.get(rating_key)
            if rating in counts:
                counts[rating] += 1
            else:
                unavailable_count += 1
        breakdown = [{"value": label, "count": counts[label]} for label in rating_labels]
        if unavailable_count:
            breakdown.append({"value": "unavailable", "count": unavailable_count})
        breakdowns[metric_key] = breakdown

    series = {hostname: perf["history"] for hostname, perf in perf_by_hostname.items()}

    if job:
        job.log("Perf matrix (Top N) summary ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "totals": totals,
        "breakdowns": breakdowns,
        "series": series,
    }


def get_account_perf_matrix_topn_scorecard(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Build the perfMatrixTopN scoreCard JSON: averaged + per-hostname Core Web Vitals for the top-N hostnames."""
    collected = _collect_account_perf_topn_data(account_key, data_mode, job, context)
    account_metadata = collected["account_metadata"]
    perf_by_hostname = collected["perf_by_hostname"]
    available = [perf for perf in perf_by_hostname.values() if perf["available"]]

    if job:
        job.log("Building scoreCard...", percent=90)

    def average(metric_key: str) -> float | None:
        values = [perf[metric_key] for perf in available if perf.get(metric_key) is not None]
        return round(sum(values) / len(values), 2) if values else None

    hostname_entries = [
        {
            "hostname": hostname,
            "corewebvitals": {
                "lcpMs": perf["lcpMs"],
                "inpMs": perf["inpMs"],
                "cls": perf["cls"],
                "lcpRating": perf["lcpRating"],
                "inpRating": perf["inpRating"],
                "clsRating": perf["clsRating"],
                "source": perf["source"],
            },
        }
        for hostname, perf in perf_by_hostname.items()
    ]

    if job:
        job.log("Perf matrix (Top N) scoreCard ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "totals": {
            "hostnames": len(collected["hostnames"]),
            "corewebvitals": {
                "lcpMsAvg": average("lcpMs"),
                "inpMsAvg": average("inpMs"),
                "clsAvg": average("cls"),
            },
        },
        "hostnames": hostname_entries,
    }
    return {
        "spreadsheet_id": os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID"),
        "summary_metrics_range": os.getenv("GOOGLE_SHEETS_SUMMARY_METRICS_RANGE") or "SummaryMetrics!A:E",
        "accounts_range": os.getenv("GOOGLE_SHEETS_ACCOUNTS_RANGE") or "Accounts!A:I",
        "summary_panels_range": os.getenv("GOOGLE_SHEETS_SUMMARY_PANELS_RANGE") or "SummaryPanels!A:F",
        "account_details_range": os.getenv("GOOGLE_SHEETS_ACCOUNT_DETAILS_RANGE") or "AccountDetails!A:D",
        "account_hero_metrics_range": os.getenv("GOOGLE_SHEETS_ACCOUNT_HERO_METRICS_RANGE") or "AccountHeroMetrics!A:F",
        "account_highlights_range": os.getenv("GOOGLE_SHEETS_ACCOUNT_HIGHLIGHTS_RANGE") or "AccountHighlights!A:F",
        "account_actions_range": os.getenv("GOOGLE_SHEETS_ACCOUNT_ACTIONS_RANGE") or "AccountActions!A:F",
        "account_pillars_range": os.getenv("GOOGLE_SHEETS_ACCOUNT_PILLARS_RANGE") or "AccountPillars!A:H",
    }


WSA_ALERT_RELATIVE_PATH = Path("REPORTS") / "CSVDATA" / "wsa-alerts.csv"

# Identity columns in wsa-alerts.csv; every other column is a feature/alert setting.
WSA_ALERT_BASE_COLUMNS = [
    "configName",
    "policyId",
    "notificationNames",
    "priority",
    "managedBy",
    "threshold",
]
WSA_ALERT_BASE_COLUMN_SET = set(WSA_ALERT_BASE_COLUMNS)


def get_wsa_alert_feature_columns(columns: list[str]) -> list[str]:
    """Every wsa-alerts.csv column that isn't a base identity attribute is a feature/alert column."""
    return [column for column in columns if column not in WSA_ALERT_BASE_COLUMN_SET]


def get_account_wsa_alert_matrix(
    account_key: str, data_mode: str, job: Job, context: str | None = None
) -> dict[str, Any]:
    """Build the WSA Alert Matrix table for an account from wsa-alerts.csv."""
    job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    job.log(f"Resolving wsa-alerts.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, WSA_ALERT_RELATIVE_PATH, job, context)

    job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    feature_columns = get_wsa_alert_feature_columns(columns)
    configs = sorted({row.get("configName", "") for row in rows if row.get("configName")})

    job.log("WSA Alert matrix ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "baseColumns": [column for column in WSA_ALERT_BASE_COLUMNS if column in columns],
        "featureColumns": feature_columns,
        "configs": configs,
        "rows": rows,
        "totals": {"rows": len(rows), "configs": len(configs), "features": len(feature_columns)},
    }


def get_account_wsa_alert_matrix_summary(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Summarize wsa-alerts.csv: value counts for base columns + enabled/disabled for feature columns."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving wsa-alerts.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, WSA_ALERT_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    feature_columns = get_wsa_alert_feature_columns(columns)
    configs = sorted({row.get("configName", "") for row in rows if row.get("configName")})

    if job:
        job.log("Computing WSA Alert summary breakdowns...", percent=80)
    total_rows = len(rows)
    breakdowns: dict[str, list[dict[str, Any]]] = {}

    # Base columns: value-count breakdown
    for column in WSA_ALERT_BASE_COLUMNS:
        if column not in columns:
            continue
        value_counts: dict[str, int] = {}
        for row in rows:
            value = (row.get(column) or "").strip() or "(blank)"
            value_counts[value] = value_counts.get(value, 0) + 1
        breakdowns[column] = [
            {"value": value, "count": count}
            for value, count in sorted(value_counts.items(), key=lambda item: item[1], reverse=True)
        ]

    # Feature columns: enabled / disabled
    overall_enabled = 0
    for column in feature_columns:
        enabled_count = sum(1 for row in rows if is_feature_value_present(row.get(column)))
        disabled_count = total_rows - enabled_count
        overall_enabled += enabled_count
        breakdowns[column] = [
            {"value": "Enabled", "count": enabled_count},
            {"value": "Disabled", "count": disabled_count},
        ]
    overall_total_cells = total_rows * len(feature_columns)
    overall_disabled = overall_total_cells - overall_enabled

    if job:
        job.log("WSA Alert matrix summary ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "columns": columns,
        "baseColumns": [column for column in WSA_ALERT_BASE_COLUMNS if column in columns],
        "featureColumns": feature_columns,
        "totals": {
            "rows": total_rows,
            "configs": len(configs),
            "features": len(feature_columns),
            "enabled": overall_enabled,
            "disabled": overall_disabled,
        },
        "breakdowns": breakdowns,
    }


def get_account_wsa_alert_matrix_scorecard(
    account_key: str, data_mode: str, job: Job | None = None, context: str | None = None
) -> dict[str, Any]:
    """Build the wsaAlertMatrix scoreCard JSON: per-feature count and the configName entries that have it set."""
    if job:
        job.log(f"Looking up account mapping for '{account_key}'...", percent=2)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    if job:
        job.log(f"Resolving wsa-alerts.csv location ({data_mode})...", percent=8)
    csv_path = resolve_report_csv_path(account_key, data_mode, WSA_ALERT_RELATIVE_PATH, job, context)

    if job:
        job.log(f"Reading {csv_path.name}...", percent=60)
    columns, rows = read_csv_as_json(csv_path)
    feature_columns = get_wsa_alert_feature_columns(columns)
    configs = sorted({row.get("configName", "") for row in rows if row.get("configName")})

    if job:
        job.log("Building WSA Alert scoreCard...", percent=80)
    wsa_alert_matrix: list[dict[str, Any]] = []
    for column in feature_columns:
        config_entries = [
            {"configName": row.get("configName", ""), "status": (row.get(column) or "").strip()}
            for row in rows
            if (row.get(column) or "").strip()
        ]
        wsa_alert_matrix.append(
            {"featureName": column, "count": len(config_entries), "configs": config_entries}
        )

    if job:
        job.log("WSA Alert matrix scoreCard ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_metadata.get("accountName", account_key),
        "accountId": account_metadata.get("accountId", ""),
        "dataMode": data_mode,
        "wsaAlertMatrix": wsa_alert_matrix,
        "totals": {"configs": len(configs), "features": len(feature_columns)},
    }


# ----------------------------------------------------------------------------
# securityFeatureCharts: single-endpoint call to the Grover security-trends API for
# an interactive date range + account name, returning multi-dimension time-series
# JSON for the front-end line chart widget.
# ----------------------------------------------------------------------------

GROVER_SECURITY_TRENDS_URL = "https://api.grover.akamai.com/security-trends/query-account-data"

# Common date/label field names seen across trend-style APIs; used to detect the x-axis field.
_SECURITY_TREND_DATE_KEYS = ("date", "day", "timestamp", "period", "ts", "eventDate", "recordDate")


def get_grover_api_key() -> str:
    return get_grover_config()["api_key"]


@sleep_and_retry
@limits(calls=int(os.getenv("GROVER_RATE_LIMIT_CALLS") or 30), period=60)
def fetch_grover_security_trends(
    session: requests.Session, start_date: str, end_date: str, account_name: str, api_key: str
) -> requests.Response:
    """POST the security-trends query to the Grover API for a date range + account name."""
    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
    payload = {"start_date": start_date, "end_date": end_date, "account_name": account_name}
    return session.post(GROVER_SECURITY_TRENDS_URL, headers=headers, json=payload, timeout=30)


def _coerce_security_trend_value(value: Any) -> float | None:
    """Grover metrics may arrive as numbers or numeric strings; normalize both (never assume typing)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def extract_security_trend_series(payload: Any) -> tuple[dict[str, list[dict[str, Any]]], list[str]]:
    """Normalize the Grover API response into per-dimension time series for the line chart widget.

    Handles a flat list of {date, metricA, metricB, ...} records, or a payload wrapping that list in a
    top-level "data"/"results"/"records"/"trends"/"series" key. Returns ({}, []) for unrecognized shapes;
    the raw payload is still returned to the caller so the UI can fall back to a raw JSON view."""
    records: list[dict[str, Any]] = []
    if isinstance(payload, list):
        records = [item for item in payload if isinstance(item, dict)]
    elif isinstance(payload, dict):
        for key in ("data", "results", "records", "trends", "series"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                records = [item for item in candidate if isinstance(item, dict)]
                break

    if not records:
        return {}, []

    date_key = next((key for key in _SECURITY_TREND_DATE_KEYS if key in records[0]), None)
    metric_keys = [
        key for key in records[0].keys() if key != date_key and _coerce_security_trend_value(records[0].get(key)) is not None
    ]

    series: dict[str, list[dict[str, Any]]] = {key: [] for key in metric_keys}
    for index, record in enumerate(records):
        label = str(record.get(date_key)) if date_key else str(index)
        for metric_key in metric_keys:
            series[metric_key].append({"date": label, "value": _coerce_security_trend_value(record.get(metric_key))})

    return series, metric_keys


def get_account_security_feature_charts(
    account_key: str, start_date: str, end_date: str, account_name: str, job: Job
) -> dict[str, Any]:
    """Fetch security trend chart data (multi-dimension time series) from the Grover API for one account/date range."""
    job.log(f"Looking up account mapping for '{account_key}'...", percent=5)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key) or {}
    resolved_account_name = account_name.strip() or account_metadata.get("accountName", account_key)

    api_key = get_grover_api_key()
    if not api_key:
        job.log(
            "X_API_KEY is not set in .env.server; the Grover API call will likely fail authentication",
            level="warning",
            percent=10,
        )

    job.log(
        f"Querying Grover security-trends API for '{resolved_account_name}' ({start_date} \u2192 {end_date})...",
        percent=20,
    )

    session = requests.Session()
    try:
        response = fetch_grover_security_trends(session, start_date, end_date, resolved_account_name, api_key)
    except requests.exceptions.RequestException as error:
        message = f"Grover API request failed: {error}"
        job.log(message, level="error", percent=40)
        raise RuntimeError(message) from error

    job.log(f"Grover API responded with status {response.status_code}", percent=70)

    if response.status_code != 200:
        message = f"Grover API error {response.status_code}: {response.text[:500]}"
        job.log(message, level="error", percent=80)
        raise RuntimeError(message)

    try:
        payload = response.json()
    except ValueError as error:
        message = f"Grover API returned invalid JSON: {error}"
        job.log(message, level="error", percent=80)
        raise RuntimeError(message) from error

    job.log("Parsing security trend series...", percent=85)
    series, dimensions = extract_security_trend_series(payload)
    if not dimensions:
        job.log("No numeric time-series dimensions recognized in the response; showing raw JSON only", level="warning", percent=90)

    job.log("Security feature charts ready", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": resolved_account_name,
        "accountId": account_metadata.get("accountId", ""),
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": dimensions,
        "series": series,
        "raw": payload,
    }


def parse_private_key(raw: str | None) -> str | None:
    if not raw:
        return None
    return raw.replace("\\n", "\n")


def to_tone(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {"healthy", "watch", "risk", "neutral"}:
        return normalized
    return "neutral"


def to_map(values: list[list[str]]) -> list[dict[str, str]]:
    if not values:
        return []

    headers = [header.strip() for header in values[0]]
    rows = values[1:]
    mapped: list[dict[str, str]] = []

    for row in rows:
        if not any(cell.strip() for cell in row):
            continue
        current: dict[str, str] = {}
        for idx, header in enumerate(headers):
            current[header] = row[idx].strip() if idx < len(row) else ""
        mapped.append(current)

    return mapped


def get_google_clients() -> tuple[Any, Any] | tuple[None, None]:
    cfg = get_google_config()
    client_email = os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    private_key = parse_private_key(os.getenv("GOOGLE_PRIVATE_KEY"))

    if not client_email or not private_key or not cfg["spreadsheet_id"]:
        return None, None

    creds = service_account.Credentials.from_service_account_info(
        {
            "type": "service_account",
            "client_email": client_email,
            "private_key": private_key,
            "token_uri": "https://oauth2.googleapis.com/token",
        },
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets.readonly",
            "https://www.googleapis.com/auth/documents.readonly",
        ],
    )

    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    docs = build("docs", "v1", credentials=creds, cache_discovery=False)
    return sheets, docs


def fetch_sheet_range(range_name: str) -> list[list[str]]:
    cfg = get_google_config()
    sheets, _ = get_google_clients()

    if not sheets or not cfg["spreadsheet_id"]:
        return []

    response = (
        sheets.spreadsheets()
        .values()
        .get(spreadsheetId=cfg["spreadsheet_id"], range=range_name)
        .execute()
    )
    return response.get("values", [])


def fetch_google_doc_text(doc_id: str) -> str | None:
    if not doc_id:
        return None

    _, docs = get_google_clients()
    if not docs:
        return None

    response = docs.documents().get(documentId=doc_id).execute()
    content = response.get("body", {}).get("content", [])

    chunks: list[str] = []
    for block in content:
        paragraph = block.get("paragraph", {})
        for element in paragraph.get("elements", []):
            text_run = element.get("textRun", {})
            chunks.append(text_run.get("content", ""))

    text = " ".join("".join(chunks).split())
    return text or None


def to_summary_metrics(values: list[list[str]]) -> list[dict[str, Any]]:
    mapped = to_map(values)
    return [
        {
            "id": row.get("id") or f"metric-{idx + 1}",
            "title": row.get("title", ""),
            "value": row.get("value", ""),
            "subtitle": row.get("subtitle", ""),
            "tone": to_tone(row.get("tone", "")),
        }
        for idx, row in enumerate(mapped)
    ]


def to_accounts(values: list[list[str]]) -> list[dict[str, Any]]:
    mapped = to_map(values)
    rows: list[dict[str, Any]] = []
    for idx, row in enumerate(mapped):
        rows.append(
            {
                "accountId": row.get("accountId") or f"account-{idx + 1}",
                "name": row.get("name", ""),
                "healthScore": {
                    "value": int(row.get("healthScore") or 0),
                    "tone": to_tone(row.get("healthTone", "")),
                },
                "renewalRisk": row.get("renewalRisk", ""),
                "expansionPotential": row.get("expansionPotential", ""),
                "technicalMaturity": row.get("technicalMaturity", ""),
                "deliveryHealth": row.get("deliveryHealth", ""),
                "execAttention": row.get("execAttention", ""),
            }
        )
    return rows


def to_summary_panels(values: list[list[str]]) -> list[dict[str, Any]]:
    mapped = to_map(values)
    grouped: dict[str, dict[str, Any]] = {}

    for idx, row in enumerate(mapped):
        panel_id = row.get("panelId") or f"panel-{idx + 1}"
        item = {
            "id": row.get("itemId") or f"{panel_id}-item-{idx + 1}",
            "label": row.get("label", ""),
            "value": row.get("value", ""),
            "tone": to_tone(row.get("tone", "")),
        }

        if panel_id in grouped:
            grouped[panel_id]["items"].append(item)
            continue

        grouped[panel_id] = {
            "id": panel_id,
            "title": row.get("panelTitle", ""),
            "items": [item],
        }

    return list(grouped.values())


def to_detail_pillars(values: list[list[str]], account_id: str) -> list[dict[str, Any]]:
    mapped = [row for row in to_map(values) if row.get("accountId") == account_id]
    grouped: dict[str, dict[str, Any]] = {}

    for idx, row in enumerate(mapped):
        pillar_id = row.get("pillarId") or f"pillar-{idx + 1}"
        item = {
            "id": row.get("itemId") or f"{pillar_id}-item-{idx + 1}",
            "label": row.get("label", ""),
            "value": row.get("value", ""),
            "tone": to_tone(row.get("tone", "")),
        }

        if pillar_id in grouped:
            grouped[pillar_id]["items"].append(item)
            continue

        grouped[pillar_id] = {
            "id": pillar_id,
            "title": row.get("pillarTitle", ""),
            "items": [item],
        }

    return list(grouped.values())


def to_items_with_optional_docs(values: list[list[str]], account_id: str) -> list[dict[str, Any]]:
    mapped = [row for row in to_map(values) if row.get("accountId") == account_id]
    items: list[dict[str, Any]] = []

    for idx, row in enumerate(mapped):
        doc_text = fetch_google_doc_text(row.get("docId", ""))
        items.append(
            {
                "id": row.get("itemId") or f"{account_id}-item-{idx + 1}",
                "label": row.get("label", ""),
                "value": doc_text or row.get("value", ""),
                "tone": to_tone(row.get("tone", "")),
            }
        )

    return items


def fetch_summary_from_google() -> dict[str, Any]:
    cfg = get_google_config()
    metrics_values = fetch_sheet_range(cfg["summary_metrics_range"] or "SummaryMetrics!A:E")
    account_values = fetch_sheet_range(cfg["accounts_range"] or "Accounts!A:I")
    panel_values = fetch_sheet_range(cfg["summary_panels_range"] or "SummaryPanels!A:F")

    return {
        "summaryMetrics": to_summary_metrics(metrics_values),
        "accounts": to_accounts(account_values),
        "summaryPanels": to_summary_panels(panel_values),
    }


def fetch_detail_from_google(account_id: str) -> dict[str, Any] | None:
    cfg = get_google_config()
    details_values = fetch_sheet_range(cfg["account_details_range"] or "AccountDetails!A:D")
    hero_values = fetch_sheet_range(cfg["account_hero_metrics_range"] or "AccountHeroMetrics!A:F")
    highlights_values = fetch_sheet_range(cfg["account_highlights_range"] or "AccountHighlights!A:F")
    actions_values = fetch_sheet_range(cfg["account_actions_range"] or "AccountActions!A:F")
    pillars_values = fetch_sheet_range(cfg["account_pillars_range"] or "AccountPillars!A:H")

    detail_row = next((row for row in to_map(details_values) if row.get("accountId") == account_id), None)
    if not detail_row:
        return None

    hero_metrics = [
        {
            "id": row.get("id") or f"{account_id}-hero-{idx + 1}",
            "title": row.get("title", ""),
            "value": row.get("value", ""),
            "subtitle": row.get("subtitle", ""),
            "tone": to_tone(row.get("tone", "")),
        }
        for idx, row in enumerate(to_map(hero_values))
        if row.get("accountId") == account_id
    ]

    return {
        "accountId": account_id,
        "name": detail_row.get("name", ""),
        "owner": detail_row.get("owner", ""),
        "quarter": detail_row.get("quarter", ""),
        "heroMetrics": hero_metrics,
        "highlights": to_items_with_optional_docs(highlights_values, account_id),
        "actions": to_items_with_optional_docs(actions_values, account_id),
        "pillars": to_detail_pillars(pillars_values, account_id),
    }


def get_summary_dashboard_data() -> dict[str, Any]:
    if get_server_mode() != "google":
        return {
            "source": "mock",
            "data": {
                "summaryMetrics": summary_metrics,
                "accounts": accounts,
                "summaryPanels": summary_panels,
            },
        }

    try:
        data = fetch_summary_from_google()
        if not data["summaryMetrics"] or not data["accounts"] or not data["summaryPanels"]:
            raise ValueError("Google dataset is incomplete")
        return {"source": "google", "data": data}
    except Exception:
        return {
            "source": "mock",
            "data": {
                "summaryMetrics": summary_metrics,
                "accounts": accounts,
                "summaryPanels": summary_panels,
            },
        }


def get_summary_dashboard_debug() -> dict[str, Any]:
    cfg = get_google_config()
    try:
        metrics_values = fetch_sheet_range(cfg["summary_metrics_range"] or "SummaryMetrics!A:E")
        account_values = fetch_sheet_range(cfg["accounts_range"] or "Accounts!A:I")
        panel_values = fetch_sheet_range(cfg["summary_panels_range"] or "SummaryPanels!A:F")

        return {
            "serverMode": get_server_mode(),
            "spreadsheetId": cfg["spreadsheet_id"],
            "ranges": {
                "summaryMetricsRange": cfg["summary_metrics_range"],
                "accountsRange": cfg["accounts_range"],
                "summaryPanelsRange": cfg["summary_panels_range"],
            },
            "rowCounts": {
                "summaryMetrics": len(metrics_values),
                "accounts": len(account_values),
                "summaryPanels": len(panel_values),
            },
            "parsedCounts": {
                "summaryMetrics": len(to_summary_metrics(metrics_values)),
                "accounts": len(to_accounts(account_values)),
                "summaryPanels": len(to_summary_panels(panel_values)),
            },
            "sampleHeaders": {
                "summaryMetrics": metrics_values[0] if metrics_values else [],
                "accounts": account_values[0] if account_values else [],
                "summaryPanels": panel_values[0] if panel_values else [],
            },
        }
    except Exception as error:
        return {
            "serverMode": get_server_mode(),
            "spreadsheetId": cfg["spreadsheet_id"],
            "error": str(error),
        }


def get_account_dashboard_data(account_id: str) -> dict[str, Any]:
    if get_server_mode() != "google":
        return {"source": "mock", "data": account_details.get(account_id)}

    try:
        data = fetch_detail_from_google(account_id)
        return {
            "source": "google" if data else "mock",
            "data": data or account_details.get(account_id),
        }
    except Exception:
        return {"source": "mock", "data": account_details.get(account_id)}
