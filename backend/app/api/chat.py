import json
from typing import List

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..core.deps import get_current_user
from ..models.user import User
from ..services import chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: str = ""
    model: str = "gemini-2.5-flash"


@router.post("/message")
async def chat_message(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    async def event_stream():
        try:
            async for text in chat_service.chat_stream(messages, body.context, body.model):
                yield f"data: {json.dumps({'text': text}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
