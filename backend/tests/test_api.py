import io
import time

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

import pipeline.run as run_mod
from api.main import app

client = TestClient(app)


def _png(arr):
    b = io.BytesIO(); Image.fromarray(arr).save(b, "PNG"); return b.getvalue()


def test_end_to_end(monkeypatch):
    n = 300
    rng = np.random.default_rng(0)
    monkeypatch.setattr(run_mod, "predict_relative_depth", lambda im: rng.random((n, n)).astype(np.float32))
    img = _png(rng.integers(0, 255, (n, n, 3), dtype=np.uint8))
    lab = _png(rng.integers(0, 4, (n, n), dtype=np.uint8))
    r = client.post("/api/v1/process", files={"image": ("a.png", img), "labels": ("l.png", lab)})
    assert r.status_code == 202
    jid = r.json()["job_id"]
    for _ in range(50):
        s = client.get(f"/api/v1/jobs/{jid}").json()
        if s["status"] in ("done", "failed"):
            break
        time.sleep(0.1)
    assert s["status"] == "done", s
    m = client.get(f"/api/v1/jobs/{jid}/metadata").json()
    assert m["mode"] == "relative" and m["width"] == n
    for f in ("heightmap.png", "confidence.png", "texture.jpg"):
        assert client.get(f"/api/v1/jobs/{jid}/{f}").status_code == 200
