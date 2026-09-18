from __future__ import annotations
import time
import hashlib
import json
import logging
from typing import Dict, Any, Optional, Tuple, Callable
from pydantic import ValidationError

from ..models.canonical import CanonicalMetricSnapshot, DownstreamCall

logger = logging.getLogger("rootcause.adapter")


class MappingRecipe:
    """
    Cached transformation recipe for a specific payload schema fingerprint.
    Transforms raw incoming payloads into canonical fields without LLM overhead.
    """
    def __init__(
        self,
        service_id_path: Tuple[str, ...],
        rps_path: Optional[Tuple[str, ...]] = None,
        latency_p50_path: Optional[Tuple[str, ...]] = None,
        latency_p99_path: Optional[Tuple[str, ...]] = None,
        latency_unit: str = "ms",  # "ms", "s", "us"
        error_rate_path: Optional[Tuple[str, ...]] = None,
        error_is_percentage: bool = False,
        error_count_path: Optional[Tuple[str, ...]] = None,
        total_count_path: Optional[Tuple[str, ...]] = None,
        retries_path: Optional[Tuple[str, ...]] = None,
        pool_active_path: Optional[Tuple[str, ...]] = None,
        pool_max_path: Optional[Tuple[str, ...]] = None,
        downstream_calls_path: Optional[Tuple[str, ...]] = None,
    ):
        self.service_id_path = service_id_path
        self.rps_path = rps_path
        self.latency_p50_path = latency_p50_path
        self.latency_p99_path = latency_p99_path
        self.latency_unit = latency_unit
        self.error_rate_path = error_rate_path
        self.error_is_percentage = error_is_percentage
        self.error_count_path = error_count_path
        self.total_count_path = total_count_path
        self.retries_path = retries_path
        self.pool_active_path = pool_active_path
        self.pool_max_path = pool_max_path
        self.downstream_calls_path = downstream_calls_path

    @staticmethod
    def _get_nested(data: Dict[str, Any], path: Optional[Tuple[str, ...]]) -> Any:
        if not path:
            return None
        current = data
        for step in path:
            if isinstance(current, dict) and step in current:
                current = current[step]
            else:
                return None
        return current

    def apply(self, raw: Dict[str, Any]) -> CanonicalMetricSnapshot:
        # 1. Service ID
        service_id = str(self._get_nested(raw, self.service_id_path) or "unknown-service")

        # 2. Timestamp (use current epoch if absent)
        timestamp = float(raw.get("timestamp") or time.time())

        # 3. RPS / Throughput
        raw_rps = self._get_nested(raw, self.rps_path)
        rps = float(raw_rps) if raw_rps is not None else 0.0

        # 4. Latencies with unit scaling
        scale = 1.0
        if self.latency_unit == "s":
            scale = 1000.0
        elif self.latency_unit == "us":
            scale = 0.001

        raw_p50 = self._get_nested(raw, self.latency_p50_path)
        latency_p50 = (float(raw_p50) * scale) if raw_p50 is not None else 0.0

        raw_p99 = self._get_nested(raw, self.latency_p99_path)
        latency_p99 = (float(raw_p99) * scale) if raw_p99 is not None else 0.0

        # 5. Error Rate normalization
        error_rate = 0.0
        if self.error_rate_path:
            raw_err = self._get_nested(raw, self.error_rate_path)
            if raw_err is not None:
                err_val = float(raw_err)
                if self.error_is_percentage or err_val > 1.0:
                    error_rate = min(1.0, max(0.0, err_val / 100.0))
                else:
                    error_rate = min(1.0, max(0.0, err_val))
        elif self.error_count_path and self.total_count_path:
            err_cnt = float(self._get_nested(raw, self.error_count_path) or 0)
            tot_cnt = float(self._get_nested(raw, self.total_count_path) or 1)
            error_rate = min(1.0, max(0.0, err_cnt / tot_cnt)) if tot_cnt > 0 else 0.0

        # 6. Retries
        raw_retries = self._get_nested(raw, self.retries_path)
        retries = float(raw_retries) if raw_retries is not None else 0.0

        # 7. Pool active / max
        raw_active = self._get_nested(raw, self.pool_active_path)
        pool_active = int(raw_active) if raw_active is not None else None

        raw_max = self._get_nested(raw, self.pool_max_path)
        pool_max = int(raw_max) if raw_max is not None else None

        # 8. Downstream calls
        downstream: list[DownstreamCall] = []
        raw_ds = self._get_nested(raw, self.downstream_calls_path)
        if isinstance(raw_ds, list):
            for item in raw_ds:
                if isinstance(item, dict):
                    target = item.get("target") or item.get("service") or item.get("name") or "unknown"
                    ds_lat = float(item.get("latency_ms") or item.get("latency") or item.get("duration") or 0.0)
                    ds_err = int(item.get("errors") or item.get("error_count") or 0)
                    ds_cnt = int(item.get("call_count") or item.get("calls") or 1)
                    downstream.append(DownstreamCall(target=str(target), latency_ms=ds_lat, errors=ds_err, call_count=ds_cnt))

        return CanonicalMetricSnapshot(
            service_id=service_id,
            timestamp=timestamp,
            throughput_rps=max(0.0, rps),
            latency_p50_ms=max(0.0, latency_p50),
            latency_p99_ms=max(0.0, latency_p99),
            error_rate=error_rate,
            retries_per_sec=max(0.0, retries),
            pool_active=pool_active,
            pool_max=pool_max,
            downstream_calls=downstream,
            metadata={"inferred_unit": self.latency_unit}
        )


class TelemetryAdapter:
    """
    The Generalized Integration Layer.
    Ingests arbitrary telemetry payloads (nested, flat, OTel, Prometheus, custom),
    learns or resolves the schema recipe, caches it, and returns a CanonicalMetricSnapshot.
    """
    def __init__(self, groq_client: Optional[Any] = None):
        self._recipes: Dict[str, MappingRecipe] = {}
        self.groq_client = groq_client

    @staticmethod
    def _compute_fingerprint(payload: Dict[str, Any]) -> str:
        """
        Creates a stable hash representing the structure/keys of the payload.
        Ensures same schema shapes reuse the same cached recipe instantly.
        """
        def extract_structure(obj: Any) -> Any:
            if isinstance(obj, dict):
                return sorted([(k, extract_structure(v)) for k, v in obj.items() if not isinstance(v, (int, float, str, bool)) or k])
            elif isinstance(obj, list) and obj:
                return [extract_structure(obj[0])]
            return type(obj).__name__

        structure = extract_structure(payload)
        serialized = json.dumps(structure, sort_keys=True)
        return hashlib.sha256(serialized.encode()).hexdigest()[:16]

    def _flatten_paths(self, d: Dict[str, Any], prefix: Tuple[str, ...] = ()) -> Dict[Tuple[str, ...], Any]:
        """Flattens a nested dictionary into paths as tuples of keys."""
        items: Dict[Tuple[str, ...], Any] = {}
        for k, v in d.items():
            new_prefix = prefix + (k,)
            if isinstance(v, dict):
                items.update(self._flatten_paths(v, new_prefix))
            else:
                items[new_prefix] = v
        return items

    def _infer_recipe_heuristically(self, payload: Dict[str, Any]) -> MappingRecipe:
        """
        Fast-path heuristic inference: inspects keys and values to build a MappingRecipe
        without incurring any LLM network latency.
        """
        flat = self._flatten_paths(payload)
        
        # 1. Service ID
        svc_path = None
        for path in flat.keys():
            last = path[-1].lower()
            if last in ("service_id", "service", "servicename", "service_name", "app", "name", "app_name"):
                svc_path = path
                break
        if not svc_path:
            svc_path = ("service_id",)

        # 2. Latency p99 and p50
        p99_path = None
        p50_path = None
        for path in flat.keys():
            last = path[-1].lower()
            if any(k in last for k in ["p99", "99th", "quantile_0.99", "p990"]):
                p99_path = path
            elif any(k in last for k in ["p50", "median", "quantile_0.5", "p500"]):
                p50_path = path
            elif not p99_path and any(k in last for k in ["latency", "duration", "response_time", "elapsed"]):
                p99_path = path

        # Latency unit detection based on value magnitude
        unit = "ms"
        if p99_path:
            val = flat.get(p99_path)
            if isinstance(val, (int, float)):
                # If latency is like 0.25 or 1.2, it's almost certainly seconds
                if 0.0 < val < 10.0:
                    unit = "s"
                elif val > 1_000_000:
                    unit = "us"

        # 3. Error rate or counts
        error_rate_path = None
        is_pct = False
        error_cnt_path = None
        total_cnt_path = None
        for path in flat.keys():
            last = path[-1].lower()
            if any(k in last for k in ["error_rate", "err_rate", "failure_rate"]):
                error_rate_path = path
                break
            elif any(k in last for k in ["error_pct", "error_percentage", "err_pct"]):
                error_rate_path = path
                is_pct = True
                break
            elif any(k in last for k in ["errors", "error_count", "failed_requests"]):
                error_cnt_path = path
            elif any(k in last for k in ["total_requests", "request_count", "requests"]):
                total_cnt_path = path

        # 4. RPS / throughput
        rps_path = None
        for path in flat.keys():
            last = path[-1].lower()
            if any(k in last for k in ["rps", "throughput", "requests_per_sec", "rate", "qps"]):
                rps_path = path
                break

        # 5. Retries
        retries_path = None
        for path in flat.keys():
            last = path[-1].lower()
            if "retri" in last:
                retries_path = path
                break

        # 6. Connection / Thread Pool
        pool_active_path = None
        pool_max_path = None
        for path in flat.keys():
            last = path[-1].lower()
            if any(k in last for k in ["pool_active", "active_connections", "busy_connections", "active_threads", "threads_busy"]):
                pool_active_path = path
            elif any(k in last for k in ["pool_max", "max_connections", "pool_size", "max_threads", "total_connections"]):
                pool_max_path = path

        # 7. Downstream calls list
        downstream_path = None
        for k, v in payload.items():
            if isinstance(v, list) and k.lower() in ("downstream_calls", "downstreams", "dependencies", "calls", "targets"):
                downstream_path = (k,)
                break

        return MappingRecipe(
            service_id_path=svc_path,
            rps_path=rps_path,
            latency_p50_path=p50_path,
            latency_p99_path=p99_path,
            latency_unit=unit,
            error_rate_path=error_rate_path,
            error_is_percentage=is_pct,
            error_count_path=error_cnt_path,
            total_count_path=total_cnt_path,
            retries_path=retries_path,
            pool_active_path=pool_active_path,
            pool_max_path=pool_max_path,
            downstream_calls_path=downstream_path,
        )

    def ingest(self, raw_payload: Dict[str, Any]) -> CanonicalMetricSnapshot:
        """
        Main entry point for incoming telemetry.
        Retrieves cached recipe by structure fingerprint, or infers and caches it.
        """
        if not isinstance(raw_payload, dict):
            raise ValueError("Payload must be a dictionary")

        fingerprint = self._compute_fingerprint(raw_payload)
        
        if fingerprint not in self._recipes:
            # 1. Run heuristic discovery
            recipe = self._infer_recipe_heuristically(raw_payload)
            self._recipes[fingerprint] = recipe
            logger.info(f"Learned and cached new telemetry recipe for fingerprint: {fingerprint}")
        else:
            recipe = self._recipes[fingerprint]

        return recipe.apply(raw_payload)
