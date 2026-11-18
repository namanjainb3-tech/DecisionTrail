from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def extract_discourse_url_from_headers(header_text: str) -> str | None:
    match = re.search(r"Post-History:.*?(https?://discuss\.python\.org/t/[^\s\),]+)", header_text, re.IGNORECASE)
    if match:
        return match.group(1).rstrip(".")
    # Try any discuss.python.org link in headers
    match = re.search(r"(https?://discuss\.python\.org/t/[^\s\),]+)", header_text)
    if match:
        return match.group(1).rstrip(".")
    return None


def parse_rejected_ideas_section(text: str) -> list[str]:
    """Extracts ground-truth items from the 'Rejected Ideas' section of a PEP."""
    # Locate Rejected Ideas header (stops at next level 1 or 2 header, or end of text)
    pattern = re.compile(
        r"(?:^|\n)(?:#{1,2}\s*Rejected Ideas|Rejected Ideas\s*\n[-=]+)(.*?)(?=\n#{1,2}\s+[A-Z]|\Z)",
        re.DOTALL | re.IGNORECASE,
    )
    match = pattern.search(text)
    if not match:
        return []

    section_body = match.group(1).strip()
    items: list[str] = []

    # 1. Try splitting by subheadings (### or ** or bullet points)
    subheadings = re.findall(r"(?:^|\n)(?:###|\*\*|\d+\.|\-)\s*([^\n]+)", section_body)
    if subheadings and len(subheadings) >= 1:
        for s in subheadings:
            cleaned = s.strip().rstrip(":")
            if len(cleaned) > 5:
                items.append(cleaned)
    else:
        # 2. Split by paragraphs
        paragraphs = [p.strip() for p in section_body.split("\n\n") if p.strip()]
        for p in paragraphs:
            if len(p) > 20:
                first_sentence = p.split(". ")[0].strip()
                items.append(first_sentence if len(first_sentence) > 10 else p)

    return items


def parse_pep_file(pep_path: Path) -> dict[str, Any] | None:
    try:
        content = pep_path.read_text(encoding="utf-8")
    except Exception as e:
        logger.error(f"Failed to read PEP file {pep_path}: {e}")
        return None

    # Extract PEP number
    num_match = re.search(r"PEP:\s*(\d+)", content, re.IGNORECASE)
    if not num_match:
        name_match = re.search(r"pep-(\d+)", pep_path.name, re.IGNORECASE)
        pep_number = int(name_match.group(1)) if name_match else 0
    else:
        pep_number = int(num_match.group(1))

    # Extract Title
    title_match = re.search(r"Title:\s*([^\n]+)", content, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else f"PEP {pep_number}"

    # Extract Discourse URL
    discourse_url = extract_discourse_url_from_headers(content[:2500])
    if not discourse_url:
        return None

    # Extract Rejected Ideas
    rejected_items = parse_rejected_ideas_section(content)
    if not rejected_items:
        return None

    return {
        "pep_number": pep_number,
        "title": title,
        "discourse_url": discourse_url,
        "rejected_ideas": rejected_items,
    }


def discover_qualifying_peps(peps_dir: Path) -> list[dict[str, Any]]:
    qualifying = []
    if not peps_dir.exists():
        logger.warning(f"PEPs directory does not exist: {peps_dir}")
        return []

    for path in peps_dir.glob("pep-*.rst"):
        pep_data = parse_pep_file(path)
        if pep_data:
            qualifying.append(pep_data)
    for path in peps_dir.glob("pep-*.md"):
        pep_data = parse_pep_file(path)
        if pep_data:
            qualifying.append(pep_data)

    # Sort by PEP number
    qualifying.sort(key=lambda x: x["pep_number"])
    pep_numbers = [p["pep_number"] for p in qualifying]
    print(f"Discovered {len(qualifying)} qualifying PEPs with Rejected Ideas and Discourse links: {pep_numbers}")
    return qualifying
