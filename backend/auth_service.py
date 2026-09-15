"""Google Sign-In verification + lightweight signed session tokens for the AI Chat bot feature.

Flow: the frontend uses Google Identity Services to obtain a Google ID token for the signed-in
user, POSTs it to /api/chat/auth/google, and this module verifies it really came from Google,
was issued for our OAuth client, and belongs to the allowed email domain (default: akamai.com).
On success we issue our own short-lived HMAC-signed session token; the frontend attaches it as
a Bearer token to every subsequent chat request (greeting, messages, uploads).
"""

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
ALLOWED_EMAIL_DOMAIN = os.getenv("CHATBOT_ALLOWED_EMAIL_DOMAIN", "akamai.com").strip().lower()
SESSION_TTL_SECONDS = int(os.getenv("CHATBOT_SESSION_TTL_SECONDS", str(12 * 60 * 60)))

# Falls back to a random per-process secret (with a startup warning) so local/dev usage doesn't
# hard-fail, but every restart invalidates existing sessions in that case.
_SESSION_SECRET = os.getenv("CHATBOT_SESSION_SECRET", "").strip()
if not _SESSION_SECRET:
    _SESSION_SECRET = secrets.token_urlsafe(32)
    print(
        "[auth_service] WARNING: CHATBOT_SESSION_SECRET is not set; using a random per-process "
        "secret. Set CHATBOT_SESSION_SECRET in the environment for stable sessions across restarts."
    )


class AuthError(Exception):
    """Raised when Google ID token verification or session validation fails."""


def verify_google_id_token(credential: str) -> dict[str, Any]:
    """Verify a Google Identity Services ID token and enforce the allowed email domain.

    Raises AuthError with a user-safe message on any failure (invalid signature, wrong
    audience, unverified email, or email domain outside ALLOWED_EMAIL_DOMAIN)."""
    if not credential or not credential.strip():
        raise AuthError("Missing Google credential")

    if not GOOGLE_OAUTH_CLIENT_ID:
        raise AuthError(
            "Server is not configured for Google Sign-In: set GOOGLE_OAUTH_CLIENT_ID in the backend environment"
        )

    try:
        idinfo = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), audience=GOOGLE_OAUTH_CLIENT_ID
        )
    except ValueError as error:
        raise AuthError(f"Invalid Google credential: {error}") from error

    if not idinfo.get("email_verified"):
        raise AuthError("Google account email is not verified")

    email = str(idinfo.get("email") or "").strip().lower()
    if not email:
        raise AuthError("Google credential did not include an email address")

    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    hosted_domain = str(idinfo.get("hd") or "").strip().lower()
    if domain != ALLOWED_EMAIL_DOMAIN and hosted_domain != ALLOWED_EMAIL_DOMAIN:
        raise AuthError(f"Only {ALLOWED_EMAIL_DOMAIN} accounts are allowed to use the AI Chat bot")

    return {"email": email, "name": idinfo.get("name") or email}


def _sign(payload: str) -> str:
    signature = hmac.new(_SESSION_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")


def issue_session_token(email: str) -> str:
    """Issue an HMAC-signed, time-limited session token: base64(email:expiry).signature."""
    expiry = int(time.time()) + SESSION_TTL_SECONDS
    payload = f"{email}:{expiry}"
    encoded_payload = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("utf-8").rstrip("=")
    signature = _sign(encoded_payload)
    return f"{encoded_payload}.{signature}"


def verify_session_token(token: str | None) -> str:
    """Return the verified email for a session token, or raise AuthError."""
    if not token:
        raise AuthError("Missing session token")

    parts = token.split(".")
    if len(parts) != 2:
        raise AuthError("Malformed session token")

    encoded_payload, signature = parts
    expected_signature = _sign(encoded_payload)
    if not hmac.compare_digest(signature, expected_signature):
        raise AuthError("Invalid session token signature")

    try:
        padded = encoded_payload + "=" * (-len(encoded_payload) % 4)
        payload = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        email, expiry_str = payload.rsplit(":", 1)
        expiry = int(expiry_str)
    except Exception as error:
        raise AuthError("Malformed session token payload") from error

    if time.time() > expiry:
        raise AuthError("Session expired; please sign in again")

    return email
