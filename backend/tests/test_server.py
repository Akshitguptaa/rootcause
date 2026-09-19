import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Add backend directory to sys.path so 'app' can always be imported
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import pytest
except ImportError:
    pytest = None

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

SAMPLE_COMPOSE = """
version: '3.8'
services:
  gateway:
    ports: ["8080:8080"]
    depends_on: [orders]
  orders:
    ports: ["8081:8081"]
    depends_on: [inventory]
  inventory:
    ports: ["8082:8082"]
"""


def test_health_check():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "llm_provider" in data


def test_parse_topology_endpoint():
    payload = {
        "yaml_content": SAMPLE_COMPOSE,
        "target_host": "localhost"
    }
    res = client.post("/api/topology/parse", json=payload)
    assert res.status_code == 200
    graph = res.json()
    assert len(graph["nodes"]) == 3
    assert "gateway" in graph["entrypoint_ids"]
    assert len(graph["edges"]) == 2


def test_propose_plan_endpoint():
    # First parse topology
    top_res = client.post("/api/topology/parse", json={"yaml_content": SAMPLE_COMPOSE})
    topology_data = top_res.json()

    # Request AI proposed plan
    plan_res = client.post("/api/plan/propose", json={"topology": topology_data})
    assert plan_res.status_code == 200
    plan = plan_res.json()
    assert plan["target_url"] == "http://localhost:8080"
    assert plan["concurrency_users"] >= 20
    assert plan["stress_pattern"] in ["RAMP_UP", "SPIKE", "BURST", "SUSTAINED"]


def test_telemetry_ingest_endpoint():
    raw_payload = {
        "service": "orders-service",
        "rps": 120.0,
        "response_time_p99": 0.45,  # 0.45 seconds -> should normalize to 450ms
        "error_percentage": 5.0,    # 5.0% -> should normalize to 0.05
        "active_connections": 18,
        "max_connections": 20
    }
    res = client.post("/api/telemetry/ingest", json=raw_payload)
    assert res.status_code == 200
    snapshot = res.json()
    assert snapshot["service_id"] == "orders-service"
    assert snapshot["latency_p99_ms"] == 450.0
    assert snapshot["error_rate"] == 0.05
    assert snapshot["pool_saturation"] == 0.9


def test_websocket_experiment_stream():
    top_res = client.post("/api/topology/parse", json={"yaml_content": SAMPLE_COMPOSE})
    topology_data = top_res.json()

    plan = {
        "name": "Quick WS Test",
        "target_url": "http://localhost:8080",
        "concurrency_users": 10,
        "duration_seconds": 2,
        "stress_pattern": "SPIKE"
    }

    with client.websocket_connect("/api/ws/experiment") as websocket:
        websocket.send_json({
            "topology": topology_data,
            "plan": plan,
            "simulation_scenario": "CASCADING_FAILURE"
        })

        events = []
        # Receive events until completion
        while True:
            data = websocket.receive_json()
            events.append(data)
            if data.get("event_type") == "COMPLETED":
                break

        event_types = [e.get("event_type") for e in events]
        assert "STATUS_UPDATE" in event_types
        assert "METRICS_TICK" in event_types
        assert "REASONING_CHUNK" in event_types
        assert "DIAGNOSIS_REPORT" in event_types
        assert "COMPLETED" in event_types


if __name__ == "__main__":
    print("Running FastAPI Server tests...")
    test_health_check()
    print(" [x] test_health_check PASSED")
    test_parse_topology_endpoint()
    print(" [x] test_parse_topology_endpoint PASSED")
    test_propose_plan_endpoint()
    print(" [x] test_propose_plan_endpoint PASSED")
    test_telemetry_ingest_endpoint()
    print(" [x] test_telemetry_ingest_endpoint PASSED")
    test_websocket_experiment_stream()
    print(" [x] test_websocket_experiment_stream PASSED")
    print("\nAll FastAPI Server tests passed successfully!")
