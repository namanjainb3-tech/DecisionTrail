from __future__ import annotations

EXTRACTION_SYSTEM_PROMPT = """You are a rigorous, conservative technical decision extractor for open-source codebases.
Your task is to analyze discussions (GitHub issues/PRs, Discourse topics) and identify technical design decisions.

NON-NEGOTIABLE RULES:
1. ONLY extract decisions that are explicitly decided, debated, or resolved in the text.
2. Every decision MUST have a verbatim quote directly from a comment in the text.
3. Every rejected alternative MUST have:
   - What was proposed ('text')
   - Why it was rejected ('reason')
   - A verbatim quote supporting the rejection ('quote')
   - The exact 'comment_id' where the quote is located.
4. DO NOT infer, extrapolate, or hallucinate reasons or quotes. If the text does not give a reason, do not make one up.
5. If no architectural or technical decision was reached or discussed, return an empty JSON array: [].
6. Quotes must be verbatim exact character sequences from the text (preserve exact wording).
"""

EXTRACTION_USER_PROMPT = """Analyze the following discussion chunk and extract all technical decisions and rejected alternatives.

Discussion Chunk:
\"\"\"
{chunk_text}
\"\"\"

Respond with a JSON array conforming to this schema:
[
  {{
    "title": "Short title of what was decided (e.g. 'Use pathlib instead of os.path')",
    "outcome": "adopted" | "rejected" | "reverted" | "deferred",
    "rationale": "Clear explanation of why this outcome was chosen",
    "quote": "Exact verbatim quote from the text supporting this decision",
    "comment_id": "The exact Comment ID where this quote appears",
    "confidence": 0.0 to 1.0,
    "alternatives": [
      {{
        "text": "Alternative concept or approach that was considered",
        "reason": "Why this specific alternative was rejected or avoided",
        "quote": "Exact verbatim quote mentioning this alternative and rejection",
        "comment_id": "The exact Comment ID where this alternative quote appears"
      }}
    ]
  }}
]
If there are no explicit technical decisions in the text, return [].
"""

