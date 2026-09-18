import os
import sys
from pathlib import Path

# Add backend directory to sys.path so 'app' can always be imported
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.topology_parser import DockerComposeParser
from app.models.topology import ServiceRole

SAMPLE_COMPOSE_YAML = """
version: '3.8'
services:
  api-gateway:
    image: node:18-alpine
    ports:
      - "8080:8080"
    depends_on:
      - orders-service
      - auth-service

  orders-service:
    image: python:3.11-slim
    ports:
      - "8081:8081"
    depends_on:
      - inventory-service
      - payment-service

  auth-service:
    image: python:3.11-slim
    ports:
      - "8084:8084"
    depends_on:
      - database-service

  inventory-service:
    image: node:18-alpine
    ports:
      - "8082:8082"
    depends_on:
      - database-service

  payment-service:
    image: python:3.11-slim
    ports:
      - "8083:8083"

  database-service:
    image: postgres:15
    ports:
      - "5432:5432"
"""


def test_topology_discovery():
    parser = DockerComposeParser()
    graph = parser.parse_content(SAMPLE_COMPOSE_YAML)

    # 1. Verify Node Count
    assert len(graph.nodes) == 6
    service_ids = {node.id for node in graph.nodes}
    assert "api-gateway" in service_ids
    assert "orders-service" in service_ids
    assert "inventory-service" in service_ids
    assert "payment-service" in service_ids
    assert "auth-service" in service_ids
    assert "database-service" in service_ids

    # 2. Verify Port & URL Resolution
    gateway = graph.get_node("api-gateway")
    assert gateway is not None
    assert gateway.host_port == 8080
    assert gateway.base_url == "http://localhost:8080"
    assert gateway.chaos_url == "http://localhost:8080/_chaos"
    assert gateway.role == ServiceRole.INGRESS

    # 3. Verify Ingress Detection
    assert "api-gateway" in graph.entrypoint_ids

    # 4. Verify Shared Bottleneck Detection
    # database-service is called by both auth-service and inventory-service
    assert "database-service" in graph.shared_bottleneck_ids

    # 5. Verify Directed Edges
    assert len(graph.edges) == 6
    gateway_downstreams = graph.get_downstream_ids("api-gateway")
    assert set(gateway_downstreams) == {"orders-service", "auth-service"}

    orders_downstreams = graph.get_downstream_ids("orders-service")
    assert set(orders_downstreams) == {"inventory-service", "payment-service"}

    db_upstreams = graph.get_upstream_ids("database-service")
    assert set(db_upstreams) == {"auth-service", "inventory-service"}


def test_dict_style_depends_on():
    yaml_dict_deps = """
    services:
      web:
        ports:
          - "3000:3000"
        depends_on:
          backend:
            condition: service_healthy
      backend:
        ports:
          - "5000:5000"
    """
    parser = DockerComposeParser()
    graph = parser.parse_content(yaml_dict_deps)

    assert len(graph.nodes) == 2
    assert len(graph.edges) == 1
    assert graph.edges[0].source == "web"
    assert graph.edges[0].target == "backend"
    assert "web" in graph.entrypoint_ids


if __name__ == "__main__":
    print("Running Topology Discovery Parser tests...")
    test_topology_discovery()
    print(" [x] test_topology_discovery PASSED")
    test_dict_style_depends_on()
    print(" [x] test_dict_style_depends_on PASSED")
    print("\nAll Topology Discovery tests passed successfully!")
