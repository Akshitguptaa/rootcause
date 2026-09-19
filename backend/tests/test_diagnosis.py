import os
import sys
import asyncio
try:
    import pytest
except ImportError:
    pytest = None
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Add backend directory to sys.path so 'app' can always be imported
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.models.canonical import CanonicalMetricSnapshot, DownstreamCall
from app.models.topology import TopologyGraph, ServiceNode, DependencyEdge, ServiceRole
from app.models.diagnosis import FailureMode
from app.services.llm_provider import MockLLMProvider, GroqProvider
from app.services.diagnosis_engine import DiagnosisEngine


def _build_sample_topology() -> TopologyGraph:
    return TopologyGraph(
        nodes=[
            ServiceNode(id="api-gateway", display_name="API Gateway", base_url="http://localhost:8080", chaos_url="http://localhost:8080/_chaos", role=ServiceRole.INGRESS),
            ServiceNode(id="orders-service", display_name="Orders Service", base_url="http://localhost:8081", chaos_url="http://localhost:8081/_chaos", role=ServiceRole.INTERNAL),
            ServiceNode(id="inventory-service", display_name="Inventory Service", base_url="http://localhost:8082", chaos_url="http://localhost:8082/_chaos", role=ServiceRole.INTERNAL),
            ServiceNode(id="payment-service", display_name="Payment Service", base_url="http://localhost:8083", chaos_url="http://localhost:8083/_chaos", role=ServiceRole.LEAF_DEPENDENCY),
        ],
        edges=[
            DependencyEdge(source="api-gateway", target="orders-service"),
            DependencyEdge(source="orders-service", target="inventory-service"),
            DependencyEdge(source="orders-service", target="payment-service"),
        ],
        entrypoint_ids=["api-gateway"],
        shared_bottleneck_ids=[],
    )


def _build_cascading_snapshots() -> dict:
    return {
        "api-gateway": CanonicalMetricSnapshot(
            service_id="api-gateway",
            timestamp=1718000015.0,
            throughput_rps=120.0,
            latency_p50_ms=45.0,
            latency_p99_ms=1450.0,
            error_rate=0.12,
            pool_active=12,
            pool_max=50,
            downstream_calls=[DownstreamCall(target="orders-service", latency_ms=1380.0, errors=14)]
        ),
        "orders-service": CanonicalMetricSnapshot(
            service_id="orders-service",
            timestamp=1718000015.0,
            throughput_rps=120.0,
            latency_p50_ms=40.0,
            latency_p99_ms=1380.0,
            error_rate=0.08,
            pool_active=20,
            pool_max=20,  # 100% Saturated!
            retries_per_sec=32.0,
            downstream_calls=[
                DownstreamCall(target="inventory-service", latency_ms=1150.0, errors=10),
                DownstreamCall(target="payment-service", latency_ms=25.0, errors=0),
            ]
        ),
        "inventory-service": CanonicalMetricSnapshot(
            service_id="inventory-service",
            timestamp=1718000015.0,
            throughput_rps=150.0,
            latency_p50_ms=800.0,
            latency_p99_ms=1150.0,
            error_rate=0.0,
            pool_active=19,
            pool_max=20,
        ),
        "payment-service": CanonicalMetricSnapshot(
            service_id="payment-service",
            timestamp=1718000015.0,
            throughput_rps=40.0,
            latency_p50_ms=20.0,
            latency_p99_ms=25.0,
            error_rate=0.0,
            pool_active=3,
            pool_max=20,
        ),
    }


@pytest.mark.anyio
async def test_diagnosis_with_mock_provider():
    topology = _build_sample_topology()
    snapshots = _build_cascading_snapshots()
    engine = DiagnosisEngine(llm_provider=MockLLMProvider())

    # 1. Test streaming tokens
    tokens = []
    async for chunk in engine.stream_diagnosis(topology, snapshots):
        tokens.append(chunk)
    assert len(tokens) > 0
    full_stream = "".join(tokens)
    assert "orders-service" in full_stream

    # 2. Test structured diagnosis
    full_text, report = await engine.diagnose(topology, snapshots)
    assert report is not None
    assert report.failure_mode == FailureMode.CASCADING_FAILURE
    assert report.root_cause_service == "inventory-service"
    assert "orders-service" in report.blast_radius
    assert report.suggested_fix.target_service == "orders-service"
    assert len(report.evidence) > 0


@pytest.mark.anyio
async def test_live_groq_diagnosis():
    """Live integration test against Groq Cloud if GROQ_API_KEY is configured."""
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        pytest.skip("GROQ_API_KEY not found in environment, skipping live test")

    topology = _build_sample_topology()
    snapshots = _build_cascading_snapshots()
    engine = DiagnosisEngine(llm_provider=GroqProvider(api_key=groq_key))

    chaos_info = {
        "target": "inventory-service",
        "injected_latency_ms": 800,
        "load_rps": 120
    }

    full_text, report = await engine.diagnose(topology, snapshots, chaos_context=chaos_info)
    assert report is not None
    assert report.root_cause_service != ""
    assert report.failure_mode in [
        FailureMode.CASCADING_FAILURE,
        FailureMode.CONNECTION_POOL_EXHAUSTION,
        FailureMode.RETRY_STORM
    ]
    assert len(report.blast_radius) >= 1
    assert report.suggested_fix.recommendation != ""


if __name__ == "__main__":
    print("Running Diagnosis Engine tests...")
    asyncio.run(test_diagnosis_with_mock_provider())
    print(" [x] test_diagnosis_with_mock_provider PASSED")

    if os.getenv("GROQ_API_KEY"):
        print("\nTesting Live Groq Reasoning (streaming live thoughts)...")
        async def run_live():
            topology = _build_sample_topology()
            snapshots = _build_cascading_snapshots()
            engine = DiagnosisEngine()
            async for token in engine.stream_diagnosis(topology, snapshots):
                print(token, end="", flush=True)
            print("\n")
            _, report = await engine.diagnose(topology, snapshots)
            print(f" [x] Live Diagnosis Success: Mode={report.failure_mode.value}, RootCause={report.root_cause_service}")
        asyncio.run(run_live())
        print(" [x] test_live_groq_diagnosis PASSED")
    else:
        print(" [!] Skipping live Groq test (no GROQ_API_KEY set)")

    print("\nAll Diagnosis Engine tests completed successfully!")
