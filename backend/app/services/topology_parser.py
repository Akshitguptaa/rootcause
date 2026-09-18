from __future__ import annotations
import yaml
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path

from ..models.topology import TopologyGraph, ServiceNode, DependencyEdge, ServiceRole


class DockerComposeParser:
    """
    Parses docker-compose.yml files or YAML content to automatically discover:
    - Service instances and reachable URLs via exposed port mappings
    - Directed call dependencies via `depends_on`
    - Graph topology roles: Ingress Entrypoints, Internal Services, and Shared Bottlenecks
    """

    @staticmethod
    def _parse_port(port_entry: Any) -> Tuple[Optional[int], Optional[int]]:
        """Extracts (host_port, container_port) from string or dict port entries."""
        if isinstance(port_entry, (int, float)):
            p = int(port_entry)
            return p, p
        elif isinstance(port_entry, str):
            # Formats: "8080:8080", "127.0.0.1:8080:8080", "8080:8080/tcp", "8080"
            clean = port_entry.split("/")[0]
            parts = clean.split(":")
            if len(parts) == 1:
                p = int(parts[0])
                return p, p
            elif len(parts) == 2:
                return int(parts[0]), int(parts[1])
            elif len(parts) == 3:
                return int(parts[1]), int(parts[2])
        elif isinstance(port_entry, dict):
            host_p = port_entry.get("published")
            cont_p = port_entry.get("target")
            return int(host_p) if host_p is not None else None, int(cont_p) if cont_p is not None else None
        return None, None

    @staticmethod
    def _extract_dependencies(depends_on: Any) -> List[str]:
        """Handles both list-style and dict-style depends_on specifications in Compose."""
        if isinstance(depends_on, list):
            return [str(dep) for dep in depends_on]
        elif isinstance(depends_on, dict):
            return [str(k) for k in depends_on.keys()]
        return []

    def parse_content(self, yaml_content: str, host: str = "localhost") -> TopologyGraph:
        """Parses docker-compose YAML string and constructs the complete TopologyGraph."""
        data = yaml.safe_load(yaml_content)
        if not isinstance(data, dict):
            raise ValueError("Invalid docker-compose YAML: root must be a dictionary")

        services_dict: Dict[str, Any] = data.get("services", {})
        if not services_dict:
            raise ValueError("No services defined in docker-compose specification")

        nodes: List[ServiceNode] = []
        edges: List[DependencyEdge] = []
        
        # Track inbound (callers) and outbound (callees) degree counts
        in_degree: Dict[str, int] = {svc_id: 0 for svc_id in services_dict.keys()}
        out_degree: Dict[str, int] = {svc_id: 0 for svc_id in services_dict.keys()}

        # 1. Build nodes and direct edges
        for svc_id, svc_cfg in services_dict.items():
            ports = svc_cfg.get("ports", [])
            host_port: Optional[int] = None
            cont_port: Optional[int] = None

            if ports:
                host_port, cont_port = self._parse_port(ports[0])

            # Resolve reachable base URL
            if host_port is not None:
                base_url = f"http://{host}:{host_port}"
            else:
                base_url = f"http://{svc_id}"

            chaos_url = f"{base_url}/_chaos"

            # Parse dependencies (caller depends on downstream)
            deps = self._extract_dependencies(svc_cfg.get("depends_on"))
            for dep in deps:
                if dep in services_dict:
                    edges.append(DependencyEdge(source=svc_id, target=dep, protocol="http"))
                    out_degree[svc_id] += 1
                    in_degree[dep] += 1

            env_vars = svc_cfg.get("environment", {})
            labels = svc_cfg.get("labels", {})

            nodes.append(
                ServiceNode(
                    id=svc_id,
                    display_name=svc_id.replace("-", " ").replace("_", " ").title(),
                    host_port=host_port,
                    container_port=cont_port,
                    base_url=base_url,
                    chaos_url=chaos_url,
                    role=ServiceRole.INTERNAL,
                    metadata={"environment": env_vars, "labels": labels}
                )
            )

        # 2. Identify Entrypoints and Shared Bottlenecks
        entrypoint_ids: List[str] = []
        shared_bottleneck_ids: List[str] = []

        for node in nodes:
            in_deg = in_degree.get(node.id, 0)
            out_deg = out_degree.get(node.id, 0)

            # Ingress: No upstream services call this, but it makes calls downstream (or is explicitly named gateway/proxy)
            if in_deg == 0 and (out_deg > 0 or any(kw in node.id.lower() for kw in ["gateway", "proxy", "front", "ingress", "api"])):
                node.role = ServiceRole.INGRESS
                entrypoint_ids.append(node.id)
            elif out_deg == 0 and in_deg > 0:
                node.role = ServiceRole.LEAF_DEPENDENCY
            else:
                node.role = ServiceRole.INTERNAL

            # Shared bottleneck: Multiple services depend on this single service
            if in_deg > 1:
                shared_bottleneck_ids.append(node.id)

        # Fallback if no clean ingress found: use the first node with exposed port
        if not entrypoint_ids:
            for node in nodes:
                if node.host_port is not None:
                    node.role = ServiceRole.INGRESS
                    entrypoint_ids.append(node.id)
                    break

        return TopologyGraph(
            nodes=nodes,
            edges=edges,
            entrypoint_ids=entrypoint_ids,
            shared_bottleneck_ids=shared_bottleneck_ids,
        )

    def parse_file(self, filepath: str | Path, host: str = "localhost") -> TopologyGraph:
        """Parses a docker-compose.yml file from disk."""
        path = Path(filepath)
        if not path.exists():
            raise FileNotFoundError(f"Compose file not found at {filepath}")
        content = path.read_text(encoding="utf-8")
        return self.parse_content(content, host=host)
