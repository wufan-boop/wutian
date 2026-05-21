from unittest.mock import patch


async def fake_chat_stream(messages, context, model):
    for ch in "这是测试回复":
        yield ch


def test_chat_message(client, auth_headers):
    with patch("app.services.chat_service.chat_stream", side_effect=fake_chat_stream):
        resp = client.post(
            "/api/chat/message",
            json={
                "messages": [{"role": "user", "content": "这数据准确吗"}],
                "context": "月搜索量100万，竞争度高",
                "model": "gemini-2.5-flash",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    assert '"text":' in resp.text
    assert 'data: {"done": true}' in resp.text


def test_chat_requires_auth(client):
    resp = client.post(
        "/api/chat/message",
        json={"messages": [], "context": "", "model": "gemini-2.5-flash"},
    )
    assert resp.status_code == 403


def test_chat_empty_messages(client, auth_headers):
    with patch("app.services.chat_service.chat_stream", side_effect=fake_chat_stream):
        resp = client.post(
            "/api/chat/message",
            json={"messages": [], "context": "", "model": "gemini-2.5-flash"},
            headers=auth_headers,
        )
    assert resp.status_code == 200
