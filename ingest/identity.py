from __future__ import annotations

import hashlib
import uuid
from pathlib import Path
from core.db_sqlite import get_db


def normalize_handle(handle: str) -> str:
    if not handle:
        return ""
    h = handle.strip().lower()
    if h.startswith("@"):
        h = h[1:]
    return h


def hash_email(email: str | None) -> str | None:
    if not email:
        return None
    cleaned = email.strip().lower()
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()


def resolve_canonical_person(
    platform: str,
    handle: str,
    email: str | None = None,
    display_name: str | None = None,
    db_path: Path | str | None = None,
) -> str:
    norm_handle = normalize_handle(handle)
    email_h = hash_email(email)
    norm_display = display_name.strip().lower() if display_name else None

    conn = get_db(db_path)
    with conn:
        # 1. Exact platform + handle match
        cursor = conn.execute(
            "SELECT canonical_person_id FROM aliases WHERE platform = ? AND handle = ?",
            (platform, norm_handle),
        )
        row = cursor.fetchone()
        if row:
            return row["canonical_person_id"]

        canonical_id: str | None = None

        # 2. Match by email hash across platforms
        if email_h:
            cursor = conn.execute(
                "SELECT canonical_person_id FROM aliases WHERE email_hash = ? LIMIT 1",
                (email_h,),
            )
            row = cursor.fetchone()
            if row:
                canonical_id = row["canonical_person_id"]

        # 3. Match by exact normalized display name across platforms if available
        if not canonical_id and norm_display:
            cursor = conn.execute(
                "SELECT canonical_person_id FROM aliases WHERE handle = ? LIMIT 1",
                (norm_display,),
            )
            row = cursor.fetchone()
            if row:
                canonical_id = row["canonical_person_id"]

        # 4. If no alias match found, create a new canonical person id
        if not canonical_id:
            canonical_id = f"person_{uuid.uuid4().hex[:10]}"

        # Insert alias mapping
        conn.execute(
            """
            INSERT INTO aliases (platform, handle, email_hash, canonical_person_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(platform, handle) DO UPDATE SET
                email_hash = COALESCE(excluded.email_hash, aliases.email_hash),
                canonical_person_id = excluded.canonical_person_id;
            """,
            (platform, norm_handle, email_h, canonical_id),
        )

    return canonical_id
