import json
import logging
from typing import Any, Dict

import httpx

logger = logging.getLogger(__name__)


async def call_sorftime_tool(
    tool_name: str,
    arguments: Dict[str, Any],
    mcp_url: str,
    api_key: str,
    timeout: float = 20.0,
) -> Dict[str, Any]:
    """Call a Sorftime MCP tool and return the parsed JSON result.

    The endpoint responds with SSE format:
        event: message
        data: {"result":{"content":[{"type":"text","text":"{...JSON...}"}]}}

    Returns an empty dict on any failure.
    """
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": arguments},
    }
    headers = {
        "Content-Type": "application/json",
    }
    # key已包含在mcp_url中（?key=xxx），无需Authorization header
    try:
        async with httpx.AsyncClient(timeout=timeout) as http:
            resp = await http.post(mcp_url, json=payload, headers=headers)
            resp.raise_for_status()
            raw = resp.text

        # Parse SSE — look for the first "data: " line that contains result content
        for line in raw.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            data_str = line[len("data:"):].strip()
            if not data_str:
                continue
            try:
                outer = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            # Navigate: outer["result"]["content"][0]["text"]
            content_list = (
                outer.get("result", {}).get("content") or
                outer.get("content") or
                []
            )
            for item in content_list:
                if isinstance(item, dict) and item.get("type") == "text":
                    text = item.get("text", "")
                    try:
                        return json.loads(text)
                    except json.JSONDecodeError:
                        # text might already be the data we want as a string
                        return {"raw": text}

        logger.warning("sorftime_client: no parseable data in response for tool=%s raw=%s", tool_name, raw[:200])
        return {}
    except Exception as exc:
        logger.warning("sorftime_client: error calling tool=%s: %s", tool_name, exc)
        return {}
