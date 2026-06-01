import os
from typing import Any

from google.oauth2 import service_account
from googleapiclient.discovery import build

from backend.mock_data import account_details, accounts, summary_metrics, summary_panels


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
