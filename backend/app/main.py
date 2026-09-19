from __future__ import annotations
import os
import json
import logging
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

from .models.topology import TopologyGraph
from .models.canonical import CanonicalMetricSnapshot
from .models.orchestrator import ExperimentPlan, StressPattern, SessionEvent, SessionEventType
from .services.topology_parser import DockerComposeParser
from .services.adapter import TelemetryAdapter
from .services.diagnosis_engine import DiagnosisEngine
from .services.orchestrator import ExperimentOrchestrator
from .services.llm_provider import get_llm_provider

logger = logging.getLogger("rootcause.server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# Global singletons
telemetry_adapter = TelemetryAdapter()
diagnosis_engine = DiagnosisEngine()
orchestrator = ExperimentOrchestrator(diagnosis_engine=diagnosis_engine)
topology_parser = DockerComposeParser()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("RootCause AI Server initialized successfully.")
    yield
    logger.info("RootCause AI Server shutting down.")


app = FastAPI(
    title="RootCause AI - Autonomous Chaos & Stress Diagnosis Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local Vite development & any web frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParseTopologyRequest(BaseModel):
    yaml_content: str = Field(..., description="Raw docker-compose.yml YAML text")
    target_host: str = Field(default="localhost", description="Target hostname or IP address")


class ProposePlanRequest(BaseModel):
    topology: TopologyGraph
    target_intent: Optional[str] = Field(default=None, description="Optional user focus (e.g. 'test database resilience')")


@app.get("/api/health")
async def health_check():
    provider = os.getenv("LLM_PROVIDER", "groq" if os.getenv("GROQ_API_KEY") else "mock")
    return {
        "status": "ok",
        "service": "RootCause AI Diagnosis Engine",
        "llm_provider": provider,
    }


@app.post("/api/topology/parse", response_model=TopologyGraph)
async def parse_topology(request: ParseTopologyRequest):
    """Parses raw docker-compose YAML and returns the discovered service dependency graph."""
    try:
        graph = topology_parser.parse_content(request.yaml_content, host=request.target_host)
        return graph
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse compose specification: {str(e)}")


@app.post("/api/topology/upload", response_model=TopologyGraph)
async def upload_topology(
    file: UploadFile = File(...),
    target_host: str = Form(default="localhost")
):
    """Uploads a docker-compose.yml file and returns the discovered service dependency graph."""
    try:
        content = (await file.read()).decode("utf-8")
        graph = topology_parser.parse_content(content, host=target_host)
        return graph
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process uploaded file: {str(e)}")


@app.post("/api/plan/propose", response_model=ExperimentPlan)
async def propose_experiment_plan(request: ProposePlanRequest):
    """
    Autonomous Test Planner:
    Inspects the topology graph, identifies entrypoints and critical bottlenecks,
    and proposes a targeted chaos and concurrency stress plan.
    """
    topology = request.topology
    ingress_id = topology.entrypoint_ids[0] if topology.entrypoint_ids else "api-gateway"
    ingress_node = topology.get_node(ingress_id)
    target_url = ingress_node.base_url if ingress_node else "http://localhost:8080"

    # Identify single points of failure to target
    bottlenecks = topology.shared_bottleneck_ids
    target_bottleneck = bottlenecks[0] if bottlenecks else (
        topology.nodes[-1].id if topology.nodes else "internal-service"
    )

    prompt = f"""Given this microservices topology:
- Ingress Entrypoint: {ingress_id} ({target_url})
- Services: {[n.id for n in topology.nodes]}
- Bottleneck Candidates (called by multiple services): {bottlenecks}
- Dependency Edges: {[(e.source, e.target) for e in topology.edges]}

Propose an intelligent chaos experiment plan to test for cascading failure, retry storms, or connection pool exhaustion.
Select:
1. stress_pattern (one of: RAMP_UP, SPIKE, BURST, SUSTAINED)
2. concurrency_users (integer between 20 and 200)
3. duration_seconds (integer between 10 and 30)

Return your proposal in a JSON block matching this format:
```json
{{
  "name": "Targeted Blast-Radius Stress Test",
  "stress_pattern": "RAMP_UP",
  "concurrency_users": 80,
  "duration_seconds": 15,
  "reasoning": "Reasoning for targeting these parameters"
}}
```
"""
    llm = get_llm_provider()
    try:
        response_text = await llm.generate_response(
            "You are an expert Chaos Engineering Architect proposing targeted stress tests for microservices.",
            prompt
        )
        import re
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response_text, re.DOTALL)
        if match:
            parsed = json.loads(match.group(1))
            pattern_str = parsed.get("stress_pattern", "RAMP_UP").upper()
            try:
                pattern = StressPattern(pattern_str)
            except ValueError:
                pattern = StressPattern.RAMP_UP

            return ExperimentPlan(
                name=parsed.get("name", f"Targeted Stress Test on {ingress_id}"),
                target_url=target_url,
                stress_pattern=pattern,
                concurrency_users=int(parsed.get("concurrency_users", 60)),
                duration_seconds=int(parsed.get("duration_seconds", 15)),
            )
    except Exception as e:
        logger.warning(f"Plan proposal LLM call fallback due to: {e}")

    # Deterministic fallback if LLM is unavailable
    return ExperimentPlan(
        name=f"Automated Blast-Radius Stress on {ingress_id}",
        target_url=target_url,
        stress_pattern=StressPattern.RAMP_UP,
        concurrency_users=60,
        duration_seconds=15,
    )


@app.post("/api/telemetry/ingest", response_model=CanonicalMetricSnapshot)
async def ingest_telemetry(raw_payload: Dict[str, Any]):
    """
    Adaptive Telemetry Webhook:
    Ingests arbitrary external telemetry (flat, nested, Prometheus, custom)
    and normalizes it into the Canonical Data Model.
    """
    try:
        snapshot = telemetry_adapter.ingest(raw_payload)
        return snapshot
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to ingest telemetry payload: {str(e)}")


@app.websocket("/api/ws/experiment")
async def websocket_experiment_stream(websocket: WebSocket):
    """
    Bidirectional Real-Time Streaming WebSocket:
    Accepts an experiment plan + topology (or simulation scenario), executes the run,
    and streams real-time per-second vitals, token-by-token reasoning, and final diagnosis report.
    """
    await websocket.accept()
    logger.info("WebSocket client connected to /api/ws/experiment")

    try:
        init_data = await websocket.receive_json()
        raw_topology = init_data.get("topology")
        raw_plan = init_data.get("plan")
        simulation_scenario = init_data.get("simulation_scenario")

        if not raw_topology or not raw_plan:
            await websocket.send_json({
                "event_type": SessionEventType.ERROR.value,
                "timestamp": 0.0,
                "data": {"error": "Missing 'topology' or 'plan' in initialization payload"}
            })
            await websocket.close()
            return

        topology = TopologyGraph(**raw_topology)
        plan = ExperimentPlan(**raw_plan)

        # Stream real-time events to frontend
        async for event in orchestrator.run_experiment_stream(
            topology=topology,
            plan=plan,
            simulation_scenario=simulation_scenario
        ):
            await websocket.send_json({
                "event_type": event.event_type.value,
                "timestamp": event.timestamp,
                "data": event.data
            })

    except WebSocketDisconnect:
        logger.info("Client disconnected from experiment WebSocket")
    except Exception as e:
        logger.error(f"Error in experiment WebSocket stream: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "event_type": SessionEventType.ERROR.value,
                "timestamp": 0.0,
                "data": {"error": str(e)}
            })
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
