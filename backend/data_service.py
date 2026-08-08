import csv
import os
import json
import time
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


def load_account_id_map() -> dict[str, dict[str, str]]:
    cfg = get_akamai_config()
    path = _resolve_backend_path(cfg["account_map_path"])
    if not path.exists():
        raise FileNotFoundError(f"Akamai account map file not found: {path}")

    payload = json.loads(path.read_text())
    if not isinstance(payload, dict):
        raise ValueError("Akamai account map must be a JSON object")

    normalized: dict[str, dict[str, str]] = {}
    for key, value in payload.items():
        if isinstance(value, str):
            normalized[key] = {"accountName": key, "accountId": value}
            continue

        if isinstance(value, dict):
            account_id = value.get("accountId") or value.get("account_id")
            account_name = value.get("accountName") or value.get("account_name") or key
            if isinstance(account_id, str) and account_id.strip():
                normalized[key] = {
                    "accountName": str(account_name),
                    "accountId": account_id.strip(),
                }

    if not normalized:
        raise ValueError("Akamai account map has no valid entries")

    return normalized


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


def get_account_hostname_cname_coverage(account_key: str, job: Job) -> dict[str, Any]:
    job.log(f"Looking up Akamai account mapping for '{account_key}'...", percent=1)
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key)
    if not account_metadata:
        raise ValueError(f"No mapping found for account key: {account_key}")

    account_id = account_metadata["accountId"]
    account_name = account_metadata["accountName"]
    job.log(f"Resolved account '{account_key}' -> {account_name} ({account_id})", level="success", percent=2)

    session, base_url = create_akamai_session()

    job.log("Requesting Akamai identity access (account switch key)...", percent=3)
    switch_key_response = call_with_cooloff(job, "requesting identity access", fetch_account_switch_keys, session, base_url, account_id)
    if switch_key_response.status_code != 200:
        raise ValueError(f"Identity API failed with status code {switch_key_response.status_code}")

    selected_account = resolve_account_switch_key(switch_key_response.json(), account_id)
    account_switch_key = selected_account.get("accountSwitchKey")
    if not account_switch_key:
        raise ValueError("Missing accountSwitchKey in identity response")

    session.params = {"accountSwitchKey": account_switch_key}
    job.log("Identity access granted", level="success", percent=5)

    feature_matrix_rows = build_feature_matrix(session, base_url, job)
    write_feature_matrix_csv(feature_matrix_rows)
    job.log(f"Saved feature matrix ({len(feature_matrix_rows)} rows) to featureMatrix.csv", level="success", percent=79)

    hostnames = sorted({row["hostname"] for row in feature_matrix_rows if row.get("hostname")})
    host2cname_rows = resolve_hostnames_concurrent(hostnames, job)
    write_host2cname_csv(host2cname_rows)
    job.log("Saved host-to-CNAME mapping to host2cname.csv", level="success", percent=97)

    cname_count = sum(1 for row in host2cname_rows if row["recordType"] == "CNAME")
    a_record_count = sum(1 for row in host2cname_rows if row["recordType"] == "A")
    unresolved_count = sum(1 for row in host2cname_rows if row["recordType"] in {"NONE", "ERROR"})

    resolution_by_hostname = {row["hostname"]: row for row in host2cname_rows}
    table_rows = [
        {**matrix_row, **resolution_by_hostname.get(matrix_row["hostname"], {})}
        for matrix_row in feature_matrix_rows
        if matrix_row.get("hostname")
    ]
    properties = sorted({row.get("propertyName", "") for row in feature_matrix_rows if row.get("propertyName")})

    job.log("Hostname CNAME coverage complete", level="success", percent=100)

    return {
        "accountKey": account_key,
        "accountName": account_name,
        "accountId": account_id,
        "totals": {
            "hostnames": len(host2cname_rows),
            "cname": cname_count,
            "aRecord": a_record_count,
            "unresolved": unresolved_count,
        },
        "properties": properties,
        "hostnames": [row["hostname"] for row in host2cname_rows],
        "rows": table_rows,
    }


def get_server_mode() -> str:
    return (os.getenv("SERVER_DATA_MODE") or "mock").lower()


def get_google_config() -> dict[str, str | None]:
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
