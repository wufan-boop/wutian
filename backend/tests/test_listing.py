from unittest.mock import patch


async def fake_stream(data, system_instruction=None):
    chunks = ['{"title":"Test Title","bullet_points":["B1","B2","B3","B4","B5"],', '"description":"Desc","search_terms":["k1","k2","k3","k4","k5"]}']
    for chunk in chunks:
        yield chunk


def test_listing_generate_streams(client, auth_headers):
    with patch("app.services.listing_service.generate_listing_stream", side_effect=fake_stream):
        resp = client.post(
            "/api/listing/generate",
            json={
                "product_name": "Wireless Earbuds",
                "features": "ANC, 30h battery",
                "market": "US",
            },
            headers=auth_headers,
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]


def test_listing_history_empty(client, auth_headers):
    resp = client.get("/api/listing/history", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_listing_requires_auth(client):
    resp = client.post("/api/listing/generate", json={"product_name": "X", "market": "US"})
    assert resp.status_code == 403
