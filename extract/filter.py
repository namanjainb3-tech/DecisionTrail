from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

DECISION_CUES = [
    r"\bwe decided\b",
    r"\binstead of\b",
    r"\brejected\b",
    r"\bwon't\b",
    r"\breverted\b",
    r"\balternative\b",
    r"\balternatives\b",
    r"\bdownside\b",
    r"\bdownsides\b",
    r"\bi'd rather\b",
    r"\bclosing because\b",
    r"\bnot going to\b",
    r"\brule out\b",
    r"\bruled out\b",
    r"\btrade-off\b",
    r"\btradeoffs?\b",
    r"\bopted for\b",
    r"\bin favor of\b",
    r"\bchose not to\b",
    r"\bdecided on\b",
    r"\bagreed to\b",
]

COMPILED_CUES = [re.compile(pattern, re.IGNORECASE) for pattern in DECISION_CUES]


@dataclass
class FilterStats:
    total_evaluated: int = 0
    passed_filter: int = 0

    @property
    def hit_rate(self) -> float:
        if self.total_evaluated == 0:
            return 0.0
        return self.passed_filter / self.total_evaluated


def matches_decision_cues(text: str) -> tuple[bool, list[str]]:
    matched: list[str] = []
    for pattern in COMPILED_CUES:
        if pattern.search(text):
            matched.append(pattern.pattern)
    return (len(matched) > 0, matched)


def filter_chunks(
    chunks: Sequence[Any],
    stats: FilterStats | None = None,
) -> list[Any]:
    passed = []
    for chunk in chunks:
        if stats:
            stats.total_evaluated += 1
        has_cue, _ = matches_decision_cues(chunk.text)
        if has_cue:
            if stats:
                stats.passed_filter += 1
            passed.append(chunk)
    return passed
