from __future__ import annotations

from dataclasses import dataclass, field
from core.models import Comment, Document


@dataclass
class CommentChunk:
    chunk_id: str
    thread_id: str
    thread_title: str
    platform: str
    url: str
    text: str
    comment_ids: list[str] = field(default_factory=list)
    comment_map: dict[str, Comment] = field(default_factory=dict)


def chunk_document(
    doc: Document,
    max_chunk_chars: int = 3000,
) -> list[CommentChunk]:
    if not doc.comments:
        return []

    chunks: list[CommentChunk] = []
    chunk_index = 0

    header = f"Thread Title: {doc.title}\nPlatform: {doc.platform}\nThread URL: {doc.url}\n\n"

    current_comments: list[Comment] = []
    current_length = len(header)

    def flush_chunk(comments_to_flush: list[Comment]) -> None:
        nonlocal chunk_index
        if not comments_to_flush:
            return
        
        chunk_id = f"{doc.thread_id}_chunk_{chunk_index}"
        chunk_lines = [header]
        c_map: dict[str, Comment] = {}
        c_ids: list[str] = []

        for c in comments_to_flush:
            c_map[c.comment_id] = c
            c_ids.append(c.comment_id)
            chunk_lines.append(
                f"[Comment ID: {c.comment_id} | Author: @{c.author_handle} | Date: {c.posted_at.strftime('%Y-%m-%d')}]:\n{c.body}\n"
            )

        chunks.append(
            CommentChunk(
                chunk_id=chunk_id,
                thread_id=doc.thread_id,
                thread_title=doc.title,
                platform=doc.platform,
                url=doc.url,
                text="\n".join(chunk_lines),
                comment_ids=c_ids,
                comment_map=c_map,
            )
        )
        chunk_index += 1

    for comment in doc.comments:
        comment_repr_len = len(comment.comment_id) + len(comment.author_handle) + len(comment.body) + 60
        if current_comments and (current_length + comment_repr_len > max_chunk_chars):
            flush_chunk(current_comments)
            current_comments = [comment]
            current_length = len(header) + comment_repr_len
        else:
            current_comments.append(comment)
            current_length += comment_repr_len

    if current_comments:
        flush_chunk(current_comments)

    return chunks
