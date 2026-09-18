import os
import sys
from pathlib import Path

# Add backend directory to sys.path so 'app' can always be imported
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

try:
    import pytest
except ImportError:
    pytest = None

from app.services.adapter import TelemetryAdapter


def test_standard_format():
    adapter = TelemetryAdapter()
    payload = {
        "service_id": "orders-service",
        "rps": 120.0,
        "latency_p50_ms": 25.0,
        "latency_p99_ms": 150.0,
        "error_rate": 0.02,
        "pool_active": 8,
        "pool_max": 20,
        "retries_per_sec": 3.0,
        "downstream_calls": [
            {"target": "inventory-service", "latency_ms": 80.0, "errors": 0}
        ]
    }
    snapshot = adapter.ingest(payload)
    assert snapshot.service_id == "orders-service"
    assert snapshot.throughput_rps == 120.0
    assert snapshot.latency_p99_ms == 150.0
    assert snapshot.error_rate == 0.02
    assert snapshot.pool_saturation == 0.4  # 8 / 20
    assert len(snapshot.downstream_calls) == 1
    assert snapshot.downstream_calls[0].target == "inventory-service"


def test_camel_case_with_seconds_unit_and_percentage():
    """Simulates an external service that sends seconds instead of milliseconds, and 0-100% error rate."""
    adapter = TelemetryAdapter()
    payload = {
        "serviceName": "payment-gateway",
        "throughput": 45.5,
        "response_time_p99": 0.35,  # 0.35 seconds -> should normalize to 350 ms!
        "error_percentage": 5.0,     # 5.0 % -> should normalize to 0.05!
        "threads_busy": 16,
        "max_threads": 20
    }
    snapshot = adapter.ingest(payload)
    assert snapshot.service_id == "payment-gateway"
    assert snapshot.throughput_rps == 45.5
    assert snapshot.latency_p99_ms == 350.0  # Unit converted from seconds to ms
    assert snapshot.error_rate == 0.05      # Scale converted from % to fraction
    assert snapshot.pool_saturation == 0.8  # 16 / 20


def test_nested_otel_style():
    """Simulates a nested observability metric payload."""
    adapter = TelemetryAdapter()
    payload = {
        "app": "inventory-service",
        "metrics": {
            "http": {
                "rps": 200.0,
                "latency": {
                    "p50": 15.0,
                    "p99": 850.0
                }
            },
            "system": {
                "errors": 10,
                "total_requests": 200
            },
            "resources": {
                "active_connections": 25,
                "total_connections": 25
            }
        }
    }
    snapshot = adapter.ingest(payload)
    assert snapshot.service_id == "inventory-service"
    assert snapshot.throughput_rps == 200.0
    assert snapshot.latency_p99_ms == 850.0
    assert snapshot.error_rate == 0.05  # 10 / 200
    assert snapshot.pool_saturation == 1.0  # 25 / 25 saturated!


def test_caching_behavior():
    """Verifies that the adapter caches the schema recipe on the first call and reuses it."""
    adapter = TelemetryAdapter()
    payload1 = {"service_id": "auth-svc", "rps": 10.0, "latency_p99": 40.0}
    payload2 = {"service_id": "auth-svc", "rps": 15.0, "latency_p99": 42.0}

    assert len(adapter._recipes) == 0
    s1 = adapter.ingest(payload1)
    assert len(adapter._recipes) == 1
    
    # Second ingest of identical shape should reuse cached recipe
    s2 = adapter.ingest(payload2)
    assert len(adapter._recipes) == 1
    assert s2.throughput_rps == 15.0
    assert s2.latency_p99_ms == 42.0


if __name__ == "__main__":
    print("Running Telemetry Adapter tests...")
    test_standard_format()
    print(" [x] test_standard_format PASSED")
    test_camel_case_with_seconds_unit_and_percentage()
    print(" [x] test_camel_case_with_seconds_unit_and_percentage PASSED")
    test_nested_otel_style()
    print(" [x] test_nested_otel_style PASSED")
    test_caching_behavior()
    print(" [x] test_caching_behavior PASSED")
    print("\nAll 4 tests passed successfully!")
