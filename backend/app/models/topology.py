from __future__ import annotations
from typing import List, Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel, Field


class ServiceRole(str, Enum):
    INGRESS = "ingress"               # Inbound entrypoint (e.g., API Gateway, Frontend)
    INTERNAL = "internal"             # Middle-tier business logic (e.g., Orders, Processing)
    LEAF_DEPENDENCY = "leaf_dependency"  # Deep dependency (e.g., Database, Third-party integration)


class ServiceNode(BaseModel):
    """Represents a discovered microservice instance in the topology."""
    id: str = Field(..., description="Unique service identifier (matches compose service name)")
    display_name: str = Field(..., description="Human-readable service name")
    host_port: Optional[int] = Field(default=None, description="Host-mapped exposed port")
    container_port: Optional[int] = Field(default=None, description="Internal container port")
    base_url: str = Field(..., description="Reachable HTTP base URL")
    chaos_url: str = Field(..., description="URL endpoint for chaos injection")
    role: ServiceRole = Field(default=ServiceRole.INTERNAL, description="Inferred structural role in call graph")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Environment variables, image, labels")


class DependencyEdge(BaseModel):
    """Represents a directed call/dependency from source -> target."""
    source: str = Field(..., description="Source service (the caller / upstream)")
    target: str = Field(..., description="Target service (the callee / downstream)")
    protocol: str = Field(default="http", description="Communication protocol (http, grpc, etc.)")


class TopologyGraph(BaseModel):
    """The complete system dependency graph reconstructed from topology discovery."""
    nodes: List[ServiceNode] = Field(default_factory=list, description="All discovered services")
    edges: List[DependencyEdge] = Field(default_factory=list, description="All directed dependencies")
    entrypoint_ids: List[str] = Field(default_factory=list, description="Identified ingress entrypoints (in-degree = 0)")
    shared_bottleneck_ids: List[str] = Field(default_factory=list, description="Services with multiple upstream callers (in-degree > 1)")

    def get_node(self, service_id: str) -> Optional[ServiceNode]:
        for node in self.nodes:
            if node.id == service_id:
                return node
        return None

    def get_downstream_ids(self, service_id: str) -> List[str]:
        return [edge.target for edge in self.edges if edge.source == service_id]

    def get_upstream_ids(self, service_id: str) -> List[str]:
        return [edge.source for edge in self.edges if edge.target == service_id]
