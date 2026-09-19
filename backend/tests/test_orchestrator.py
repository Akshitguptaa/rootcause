import os
import sys
import asyncio
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

from app.models.topology import TopologyGraph, ServiceNode, DependencyEdge, ServiceRole
from app.models.orchestrator import ExperimentPlan, StressPattern, SessionEventType
from app.services.chaos_drivers import ConcurrencyStressDriver, SimulationScenarioGenerator
from app.services.llm_provider import MockLLMProvider
from app.services.diagnosis_engine import DiagnosisEngine
from app.services.orchestrator import ExperimentOrchestrator


def _sample_topology() -> TopologyGraph:
    return TopologyGraph(
        nodes=[
            ServiceNode(id="api-gateway", display_name="API Gateway", base_url="http://localhost:8080", chaos_url="http://localhost:8080/_chaos", role=ServiceRole.INGRESS),
            ServiceNode(id="orders-service", display_name="Orders Service", base_url="http://localhost:8081", chaos_url="http://localhost:8081/_chaos", role=ServiceRole.INTERNAL),
            ServiceNode(id="inventory-service", display_name="Inventory Service", base_url="http://localhost:8082", chaos_url="http://localhost:8082/_chaos", role=ServiceRole.INTERNAL),
        ],
        edges=[
            DependencyEdge(source="api-gateway", target="orders-service"),
            DependencyEdge(source="orders-service", target="inventory-service"),
        ],
        entrypoint_ids=["api-gateway"]
    )


def test_simulation_generator():
    snaps_healthy = SimulationScenarioGenerator.get_tick_snapshots("STEADY_STATE", second=1)
    assert snaps_healthy["api-gateway"].error_rate == 0.0
    assert snaps_healthy["orders-service"].latency_p99_ms < 50.0

    snaps_cascade = SimulationScenarioGenerator.get_tick_snapshots("CASCADING_FAILURE", second=5)
    assert snaps_cascade["inventory-service"].latency_p99_ms > 1000.0
    assert snaps_cascade["orders-service"].pool_saturation == 1.0


def test_concurrency_stress_calculations():
    driver = ConcurrencyStressDriver(
        target_url="http://localhost:9999",
        concurrency=10,
        pattern=StressPattern.RAMP_UP,
        duration_seconds=10
    )
    # At start (elapsed=0), ramp-up gives min floor of 2 workers
    assert driver._get_active_concurrency_at(0.0) == 2
    # At halfway (elapsed=5), gives ~55%
    assert driver._get_active_concurrency_at(5.0) >= 5
    # At end (elapsed=10), gives 100%
    assert driver._get_active_concurrency_at(10.0) == 10


async def _async_test_orchestrator_stream():
    topology = _sample_topology()
    plan = ExperimentPlan(
        name="Quick Test",
        target_url="http://localhost:8080",
        duration_seconds=2,
        concurrency_users=5,
        stress_pattern=StressPattern.SPIKE
    )

    mock_engine = DiagnosisEngine(llm_provider=MockLLMProvider())
    orchestrator = ExperimentOrchestrator(diagnosis_engine=mock_engine)

    events = []
    async for event in orchestrator.run_experiment_stream(topology, plan, simulation_scenario="CASCADING_FAILURE"):
        events.append(event)

    event_types = [e.event_type for e in events]
    assert SessionEventType.STATUS_UPDATE in event_types
    assert SessionEventType.METRICS_TICK in event_types
    assert SessionEventType.REASONING_CHUNK in event_types
    assert SessionEventType.DIAGNOSIS_REPORT in event_types
    assert SessionEventType.COMPLETED in event_types

    # Verify report was emitted
    report_events = [e for e in events if e.event_type == SessionEventType.DIAGNOSIS_REPORT]
    assert len(report_events) == 1
    report_data = report_events[0].data
    assert report_data["failure_mode"] == "CASCADING_FAILURE"
    assert report_data["root_cause_service"] == "inventory-service"


@pytest.mark.anyio
async def test_orchestrator_stream():
    await _async_test_orchestrator_stream()


if __name__ == "__main__":
    print("Running Orchestrator tests...")
    test_simulation_generator()
    print(" [x] test_simulation_generator PASSED")
    test_concurrency_stress_calculations()
    print(" [x] test_concurrency_stress_calculations PASSED")
    asyncio.run(_async_test_orchestrator_stream())
    print(" [x] test_orchestrator_stream PASSED")
    print("\nAll Orchestrator tests passed successfully!")
