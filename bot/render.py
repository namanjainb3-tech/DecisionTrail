from __future__ import annotations

from typing import Any


def format_outcome_badge(outcome: str) -> str:
    badges = {
        "adopted": "**[Adopted]**",
        "rejected": "**[Rejected]**",
        "reverted": "**[Reverted]**",
        "deferred": "**[Deferred]**",
    }
    return badges.get(outcome.lower(), f"**[{outcome.capitalize()}]**")


def render_decision_markdown(item: dict[str, Any]) -> str:
    decision = item.get("decision", item)
    title = decision.get("title", "Untitled Decision")
    outcome = decision.get("outcome", "adopted")
    rationale = decision.get("rationale", "")
    score = item.get("score") or item.get("relevance_score")

    decided_at = decision.get("decided_at")
    year_str = ""
    if decided_at:
        year_str = f" ({str(decided_at)[:4]})"

    score_badge = ""
    if score is not None:
        score_pct = int(min(1.0, float(score)) * 100)
        score_badge = f" `Relevance: {score_pct}%`"

    badge = format_outcome_badge(outcome)
    lines = [f"### {badge} {title}{year_str}{score_badge}"]

    # Maintainer feedback note if available
    if "maintainer_note" in item:
        lines.append(f"> 💡 *{item['maintainer_note']}*")

    if rationale:
        lines.append(f"\n**Rationale:** {rationale}")

    # Rejected alternatives
    alts = decision.get("alternatives", [])
    if alts:
        lines.append("\n**⚠️ Historical Rejected Alternatives Considered:**")
        for alt in alts:
            alt_text = alt.get("text", "")
            alt_reason = alt.get("reason", "")
            alt_ev = alt.get("evidence", {}) or {}
            alt_quote = alt_ev.get("quote", "")
            alt_url = alt_ev.get("source_url", "")
            alt_author = alt_ev.get("author_handle", "")

            lines.append(f"- ❌ **{alt_text}**")
            if alt_reason:
                lines.append(f"  - *Reason:* {alt_reason}")
            if alt_quote and alt_url:
                author_tag = f" by @{alt_author}" if alt_author else ""
                lines.append(f"  - *Verbatim citation:* [\"{alt_quote}\"]({alt_url}){author_tag}")

    # Primary Decision Evidence
    evidence_list = decision.get("evidence", [])
    if evidence_list:
        lines.append("\n**Supporting Citation:**")
        for ev in evidence_list[:2]:
            quote = ev.get("quote", "")
            url = ev.get("source_url", "")
            author = ev.get("author_handle", "")
            author_tag = f" by @{author}" if author else ""
            if quote and url:
                lines.append(f"> \"{quote}\"\n> — [Source Discussion]({url}){author_tag}")

    return "\n".join(lines)


def render_bot_comment(top_decisions: list[dict[str, Any]]) -> str:
    if not top_decisions:
        return ""

    blocks = [
        "## 🔍 DecisionTrail Context",
        "The following past design decisions and rejected alternatives are relevant to the files modified in this pull request:\n",
    ]

    for item in top_decisions:
        blocks.append(render_decision_markdown(item))
        blocks.append("\n---\n")

    blocks.append(
        "<sub>🤖 *Generated from public discussions. Verify against the linked sources.*</sub>"
    )
    return "\n".join(blocks).strip()

