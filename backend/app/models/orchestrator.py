from __future__ import annotations
from typing import Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel, Field


class StressPattern(str, Enum):
    SPIKE = "SPIKE"              # Sudden burst to overwhelm queues instantly
    RAMP_UP = "RAMP_UP"          # Gradual scale-up to pinpoint pool exhaustion limit
    BURST = "BURST"              # Repeated oscillating pulses to test retry storms
    SUSTAINED = "SUSTAINED"      # Constant high concurrency to test resource exhaustion


class ContainerFaultType(str, Enum):
    NONE = "NONE"
    PAUSE = "PAUSE"              # Freezes container (simulates hung network/I/O)
    RESTART = "RESTART"          # Restarts container (simulates sudden crash recovery)
    KILL = "KILL"                # Terminates container


class ContainerFault(BaseModel):
    target_service: str = Field(..., description="Service container name to target")
    fault_type: ContainerFaultType = Field(default=ContainerFaultType.PAUSE)
    trigger_at_second: int = Field(default=5, ge=0, description="Second of experiment when fault is injected")
    duration_seconds: int = Field(default=5, ge=1, description="How long the fault lasts before auto-recovery")


class ExperimentPlan(BaseModel):
    """Specification of an autonomous stress and chaos experiment."""
    name: str = Field(default="Autonomous Chaos Stress Test")
    target_url: str = Field(..., description="Reachable URL of the Ingress entrypoint (e.g. http://localhost:8080)")
    stress_pattern: StressPattern = Field(default=StressPattern.RAMP_UP)
    concurrency_users: int = Field(default=50, ge=1, le=1000)
    duration_seconds: int = Field(default=15, ge=1, le=300)
    http_method: str = Field(default="GET")
    http_endpoint: str = Field(default="/")
    http_payload: Optional[Dict[str, Any]] = None
    container_fault: Optional[ContainerFault] = None


class SessionEventType(str, Enum):
    STATUS_UPDATE = "STATUS_UPDATE"
    METRICS_TICK = "METRICS_TICK"
    REASONING_CHUNK = "REASONING_CHUNK"
    DIAGNOSIS_REPORT = "DIAGNOSIS_REPORT"
    ERROR = "ERROR"
    COMPLETED = "COMPLETED"


class SessionEvent(BaseModel):
    event_type: SessionEventType
    timestamp: float
    data: Any
