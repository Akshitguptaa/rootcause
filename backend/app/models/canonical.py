from __future__ import annotations
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, computed_field


class DownstreamCall(BaseModel):
    """Metrics regarding a call made by this service to a downstream service."""
    target: str = Field(..., description="Name or identifier of the downstream target service")
    latency_ms: float = Field(..., ge=0.0, description="Observed round-trip latency to downstream in ms")
    errors: int = Field(default=0, ge=0, description="Count of errors encountered when calling target")
    call_count: int = Field(default=1, ge=1, description="Number of calls made in this window")


class CanonicalMetricSnapshot(BaseModel):
    """
    The normalized internal telemetry format consumed by the RootCause AI reasoning engine.
    Every external source (Prometheus, OTel, target microservices, custom JSON)
    is converted into this representation by the TelemetryAdapter.
    """
    service_id: str = Field(..., description="Unique service identifier (e.g. 'orders-service')")
    timestamp: float = Field(..., description="Epoch timestamp in seconds")
    
    # Traffic & Latency
    throughput_rps: float = Field(default=0.0, ge=0.0, description="Requests per second")
    latency_p50_ms: float = Field(default=0.0, ge=0.0, description="Median latency in milliseconds")
    latency_p99_ms: float = Field(default=0.0, ge=0.0, description="99th percentile latency in milliseconds")
    
    # Reliability
    error_rate: float = Field(default=0.0, ge=0.0, le=1.0, description="Normalized error rate between 0.0 and 1.0")
    retries_per_sec: float = Field(default=0.0, ge=0.0, description="Count of retries dispatched per second")
    
    # Resource & Connection Pool Saturation
    pool_active: Optional[int] = Field(default=None, ge=0, description="Active threads/connections in pool")
    pool_max: Optional[int] = Field(default=None, ge=1, description="Max capacity of thread/connection pool")
    
    # Downstream visibility
    downstream_calls: List[DownstreamCall] = Field(default_factory=list, description="Calls made to downstream dependencies")
    
    # Retain raw unmapped attributes for auditability
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional context or unmapped fields")

    @computed_field
    @property
    def pool_saturation(self) -> float:
        """Calculates pool utilization ratio (0.0 to 1.0). Returns 0.0 if pool capacity is unknown."""
        if self.pool_active is not None and self.pool_max and self.pool_max > 0:
            return min(1.0, round(self.pool_active / self.pool_max, 4))
        return 0.0


class ServiceTelemetryWindow(BaseModel):
    """A sliding chronological window of canonical metric snapshots for a specific service."""
    service_id: str
    snapshots: List[CanonicalMetricSnapshot] = Field(default_factory=list)
