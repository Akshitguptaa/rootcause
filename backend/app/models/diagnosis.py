from __future__ import annotations
from typing import List, Optional
from enum import Enum
from pydantic import BaseModel, Field


class FailureMode(str, Enum):
    HEALTHY = "HEALTHY"
    CASCADING_FAILURE = "CASCADING_FAILURE"
    RETRY_STORM = "RETRY_STORM"
    CONNECTION_POOL_EXHAUSTION = "CONNECTION_POOL_EXHAUSTION"
    TIMEOUT_MISCONFIGURATION = "TIMEOUT_MISCONFIGURATION"
    UNKNOWN = "UNKNOWN"


class SuggestedRemediation(BaseModel):
    action: str = Field(..., description="Short title of the recommended action (e.g. 'Add Circuit Breaker')")
    target_service: str = Field(..., description="Service that requires the code/config change")
    recommendation: str = Field(..., description="Detailed engineering fix instruction")


class DiagnosisReport(BaseModel):
    """Structured architectural diagnosis report produced by the LLM reasoning loop."""
    failure_mode: FailureMode = Field(..., description="Classified distributed failure pattern")
    root_cause_service: str = Field(..., description="The original service where degradation originated")
    blast_radius: List[str] = Field(default_factory=list, description="Upstream/adjacent services affected by the issue")
    confidence_score: float = Field(default=0.9, ge=0.0, le=1.0, description="Confidence in diagnosis (0.0 to 1.0)")
    summary: str = Field(..., description="Executive summary of the failure event")
    evidence: List[str] = Field(default_factory=list, description="Key telemetry data points proving the diagnosis")
    suggested_fix: SuggestedRemediation = Field(..., description="Concrete architectural remediation")
    raw_thought_stream: Optional[str] = Field(default=None, description="Streamed chain of thought reasoning")
