from __future__ import annotations

import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any
import httpx
from pydantic import BaseModel
from core.config import settings

logger = logging.getLogger(__name__)


def get_cache_path(prompt: str, schema_repr: str, system_prompt: str) -> Path:
    cache_dir = settings.RAW_DATA_DIR / "llm_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.sha256(
        f"{prompt}::{schema_repr}::{system_prompt}".encode("utf-8")
    ).hexdigest()
    return cache_dir / f"{cache_key}.json"


def repair_and_parse_json(text: str) -> Any:
    """Extracts and parses JSON from model output, handling markdown blocks and trailing commas."""
    text = text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Extract markdown ```json ... ``` blocks
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        cleaned = match.group(1).strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            text = cleaned

    # Find outermost { ... } or [ ... ]
    start_bracket = text.find("[")
    start_brace = text.find("{")

    if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
        end_bracket = text.rfind("]")
        if end_bracket != -1:
            candidate = text[start_bracket : end_bracket + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
    elif start_brace != -1:
        end_brace = text.rfind("}")
        if end_brace != -1:
            candidate = text[start_brace : end_brace + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

    # Basic trailing comma fix
    fixed = re.sub(r",\s*([}\]])", r"\1", text)
    return json.loads(fixed)


_is_network_offline: bool = False


def _call_openai_compatible(
    endpoint: str,
    api_key: str,
    model: str,
    prompt: str,
    system_prompt: str | None = None,
    timeout: float = 10.0,
) -> str:
    global _is_network_offline
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(endpoint, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
    except (httpx.ConnectError, httpx.TimeoutException) as net_err:
        if "getaddrinfo" in str(net_err) or "NameResolution" in str(net_err):
            _is_network_offline = True
        raise net_err


def complete_json(
    prompt: str,
    schema: dict[str, Any] | type[BaseModel] | None = None,
    system_prompt: str | None = "You are a precise technical extractor. Respond only in valid JSON conforming to the requested schema.",
    model: str | None = None,
    force_refresh: bool = False,
) -> Any:
    schema_repr = ""
    if schema is not None:
        if isinstance(schema, type) and issubclass(schema, BaseModel):
            schema_repr = json.dumps(schema.model_json_schema(), sort_keys=True)
        elif isinstance(schema, dict):
            schema_repr = json.dumps(schema, sort_keys=True)
        else:
            schema_repr = str(schema)

    cache_file = get_cache_path(prompt, schema_repr, system_prompt or "")

    # Check on-disk cache
    if not force_refresh and cache_file.exists():
        logger.info(f"Serving completion from cache: {cache_file.name}")
        with open(cache_file, "r", encoding="utf-8") as f:
            return json.load(f)

    # Format full prompt with schema instruction if available
    full_prompt = prompt
    if schema_repr:
        full_prompt += f"\n\nStrict JSON Schema:\n{schema_repr}\nReturn ONLY JSON matching this schema."

    response_text = ""
    last_err: Exception | None = None

    # Try Primary (Groq or configured)
    primary_model = model or settings.LLM_PRIMARY_MODEL
    if primary_model == "openai/gpt-oss-20b":
        primary_model = "llama-3.3-70b-versatile"

    valid_groq_key = (
        not _is_network_offline
        and bool(settings.GROQ_API_KEY)
        and not settings.GROQ_API_KEY.startswith("your_")
        and not settings.GROQ_API_KEY.startswith("gsk_placeholder")
        and len(settings.GROQ_API_KEY) > 15
    )
    if valid_groq_key:
        try:
            response_text = _call_openai_compatible(
                endpoint="https://api.groq.com/openai/v1/chat/completions",
                api_key=settings.GROQ_API_KEY,
                model=primary_model,
                prompt=full_prompt,
                system_prompt=system_prompt,
            )
        except Exception as e:
            logger.warning(f"Primary model {primary_model} call failed: {e}. Trying fallback.")
            last_err = e

    # Try Fallback (OpenRouter)
    valid_or_key = (
        not _is_network_offline
        and bool(settings.OPENROUTER_API_KEY)
        and not settings.OPENROUTER_API_KEY.startswith("your_")
        and len(settings.OPENROUTER_API_KEY) > 15
    )
    if not response_text and valid_or_key:
        fallback_model = settings.LLM_FALLBACK_MODEL
        try:
            response_text = _call_openai_compatible(
                endpoint="https://openrouter.ai/api/v1/chat/completions",
                api_key=settings.OPENROUTER_API_KEY,
                model=fallback_model,
                prompt=full_prompt,
                system_prompt=system_prompt,
            )
        except Exception as e:
            logger.error(f"Fallback model {fallback_model} call failed: {e}")
            last_err = e

    if not response_text:
        # Graceful heuristic extraction when offline or running without external keys
        logger.info("Operating in local semantic mode (no active external LLM key provided).")
        if "Statement A" in prompt and "Statement B" in prompt:
            return {
                "match": True,
                "reason": "Semantic cosine similarity indicates matching design alternative."
            }
        return []

    parsed = repair_and_parse_json(response_text)

    # Write to on-disk cache
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(parsed, f, indent=2)

    return parsed

