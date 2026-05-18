from unittest.mock import patch


async def fake_product_stream(data):
    payload = '{"market_overview":{"size":"10亿","competition":"中","avg_price":29.99},"competitors":[],"analysis":{"opportunities":["机会"],"risks":["风险"],"recommendation":"建议进入"}}'
    for ch in payload:
        yield ch


def test_product_research_streams(client, auth_headers):
    with patch("app.services.product_service.research_product_stream", side_effect=fake_product_stream):
        resp = client.post(
            "/api/product/research",
            json={
                "keyword": "cat tree",
                "category": "pet supplies",
                "dimensions": ["市场规模", "竞品"],
                "selling_price": 39.99,
                "fba_fee": 8.5,
                "cogs": 12.0,
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


def test_product_history_empty(client, auth_headers):
    resp = client.get("/api/product/history", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_product_requires_auth(client):
    resp = client.post("/api/product/research", json={"keyword": "test"})
    assert resp.status_code == 403
