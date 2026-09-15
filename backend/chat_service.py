"""In-memory chat session management for the AI Chat bot: ties together the account's NetStorage
xlsx report, any user-uploaded files, and Gemini to produce a greeting + ongoing chat replies.

Sessions are ephemeral (in-memory only, like job_manager's Job registry) and keyed by a
frontend-generated sessionId. There is no persistence across backend restarts."""

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from backend import gemini_service, report_insights
from backend.data_service import get_account_report_xlsx_relative_path, load_account_id_map, resolve_report_csv_path
from backend.job_manager import Job

MAX_DOCUMENTS_PER_SESSION = 5
MAX_HISTORY_TURNS = 40
SESSION_TTL_SECONDS = 12 * 60 * 60


@dataclass
class ChatDocument:
    name: str
    summary: str


@dataclass
class ChatSession:
    session_id: str
    account_key: str
    created_at: float = field(default_factory=time.time)
    last_active_at: float = field(default_factory=time.time)
    documents: list[ChatDocument] = field(default_factory=list)
    history: list[dict[str, str]] = field(default_factory=list)


_SESSIONS: dict[str, ChatSession] = {}
_SESSIONS_LOCK = threading.Lock()


def _prune_expired_sessions() -> None:
    now = time.time()
    expired = [sid for sid, session in _SESSIONS.items() if now - session.last_active_at > SESSION_TTL_SECONDS]
    for sid in expired:
        _SESSIONS.pop(sid, None)


def get_or_create_session(session_id: str, account_key: str) -> ChatSession:
    with _SESSIONS_LOCK:
        _prune_expired_sessions()
        session = _SESSIONS.get(session_id)
        if session is None:
            session = ChatSession(session_id=session_id, account_key=account_key)
            _SESSIONS[session_id] = session
        session.last_active_at = time.time()
        return session


def _add_document(session: ChatSession, name: str, summary: str) -> None:
    session.documents.append(ChatDocument(name=name, summary=summary))
    if len(session.documents) > MAX_DOCUMENTS_PER_SESSION:
        session.documents.pop(0)


def _build_system_instruction(account_key: str, session: ChatSession) -> str:
    mapping = load_account_id_map()
    account_metadata = mapping.get(account_key) or {}
    account_name = account_metadata.get("accountName") or account_key

    parts = [
        "You are the AI Chat bot embedded in the Account Health dashboard, an internal tool used by "
        "Akamai account teams. You help the current user understand the account's health, highlights, "
        "risks, and recommendations based ONLY on the data sources provided below.",
        f"Current account: {account_name} (id: {account_key}).",
        "Be concise and use short bullet points for highlights/recommendations. If the data does not "
        "contain enough information to answer a question, say so plainly instead of guessing.",
    ]

    if session.documents:
        parts.append("\nAvailable data sources for this session:")
        for document in session.documents:
            parts.append(f"\n### {document.name}\n{document.summary}")
    else:
        parts.append("\nNo data sources have been loaded yet.")

    return "\n".join(parts)


def _trim_history(session: ChatSession) -> None:
    if len(session.history) > MAX_HISTORY_TURNS:
        session.history[:] = session.history[-MAX_HISTORY_TURNS:]


def start_account_greeting(
    account_key: str, session_id: str, context: str | None, job: Job | None = None
) -> dict[str, Any]:
    """Download the account's NetStorage .xlsx report, summarize it, and ask Gemini for a greeting
    with a few highlights/recommendations plus follow-up questions."""
    session = get_or_create_session(session_id, account_key)

    if job:
        job.log("Resolving account report location...", percent=5)
    relative_path = get_account_report_xlsx_relative_path(account_key)
    report_path = resolve_report_csv_path(account_key, "csv_data_remote", relative_path, job, context)

    if job:
        job.log(f"Summarizing {report_path.name}...", percent=55)
    summary = report_insights.summarize_xlsx(report_path)
    _add_document(session, report_path.name, summary)

    if job:
        job.log("Asking Gemini for highlights and recommendations...", percent=70)
    system_instruction = _build_system_instruction(account_key, session)
    kickoff_prompt = (
        "Introduce yourself briefly (1 sentence), then give 3-5 short highlights/recommendations based on "
        "the account report data above, then ask the user 1-2 clarifying questions about what they'd like "
        "to explore next. Use bullet points for the highlights."
    )
    reply = gemini_service.generate_reply(system_instruction, session.history, kickoff_prompt, job)

    session.history.append({"role": "user", "text": kickoff_prompt})
    session.history.append({"role": "model", "text": reply})
    _trim_history(session)

    if job:
        job.log("Done.", level="success", percent=100)

    return {"sessionId": session_id, "greeting": reply, "dataSource": report_path.name}


def send_message(account_key: str, session_id: str, message: str) -> dict[str, Any]:
    if not message or not message.strip():
        raise ValueError("Message cannot be empty")

    session = get_or_create_session(session_id, account_key)
    system_instruction = _build_system_instruction(account_key, session)
    reply = gemini_service.generate_reply(system_instruction, session.history, message)

    session.history.append({"role": "user", "text": message})
    session.history.append({"role": "model", "text": reply})
    _trim_history(session)

    return {"reply": reply}


def add_uploaded_file(account_key: str, session_id: str, local_path: Path, filename: str) -> dict[str, Any]:
    session = get_or_create_session(session_id, account_key)
    summary = report_insights.summarize_file(local_path, filename)
    _add_document(session, filename, summary)

    system_instruction = _build_system_instruction(account_key, session)
    prompt = (
        f'The user just uploaded a new file named "{filename}". Briefly (2-4 sentences) acknowledge it and '
        "note what it appears to contain, based on the data source content above."
    )
    reply = gemini_service.generate_reply(system_instruction, session.history, prompt)

    session.history.append({"role": "user", "text": prompt})
    session.history.append({"role": "model", "text": reply})
    _trim_history(session)

    return {"reply": reply, "fileName": filename}
