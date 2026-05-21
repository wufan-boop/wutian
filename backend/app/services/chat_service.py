from typing import AsyncGenerator

import anthropic
from google import genai
from google.genai import types
from openai import AsyncOpenAI

from ..core.config import settings

_gemini_client = genai.Client(api_key=settings.gemini_api_key)

_SYSTEM_PROMPT_TEMPLATE = """你是亚马逊运营数据分析助手。用户刚完成了一次选品调研，调研结果如下：

{context}

请基于以上数据回答用户的问题。如果问题超出调研数据范围，如实说明。回答简洁、专业。"""


def _build_system_prompt(context: str) -> str:
    return _SYSTEM_PROMPT_TEMPLATE.format(context=context[:8000])


async def _chat_gemini(messages: list[dict], system_prompt: str) -> AsyncGenerator[str, None]:
    contents = []
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append(
            types.Content(role=role, parts=[types.Part(text=msg["content"])])
        )
    async for chunk in await _gemini_client.aio.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=contents,
        config=types.GenerateContentConfig(system_instruction=system_prompt),
    ):
        if chunk.text:
            yield chunk.text


async def _chat_claude(messages: list[dict], system_prompt: str) -> AsyncGenerator[str, None]:
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    async with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": m["role"], "content": m["content"]} for m in messages],
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def _chat_openai(messages: list[dict], system_prompt: str) -> AsyncGenerator[str, None]:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    stream = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": system_prompt}]
        + [{"role": m["role"], "content": m["content"]} for m in messages],
        stream=True,
    )
    async for chunk in stream:
        text = chunk.choices[0].delta.content or ""
        if text:
            yield text


async def chat_stream(
    messages: list[dict],
    context: str,
    model: str,
) -> AsyncGenerator[str, None]:
    system_prompt = _build_system_prompt(context)
    if model == "claude-sonnet-4-6":
        async for text in _chat_claude(messages, system_prompt):
            yield text
    elif model == "gpt-4o":
        async for text in _chat_openai(messages, system_prompt):
            yield text
    else:
        async for text in _chat_gemini(messages, system_prompt):
            yield text
