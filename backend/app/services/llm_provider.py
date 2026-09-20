from __future__ import annotations
import os
import json
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Optional
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("rootcause.llm")


class BaseLLMProvider(ABC):
    """Abstract base class for RootCause LLM providers."""

    @abstractmethod
    async def stream_reasoning(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        """Streams reasoning tokens one by one as they are generated."""
        pass

    @abstractmethod
    async def generate_response(self, system_prompt: str, user_prompt: str) -> str:
        """Returns the full completion text."""
        pass


class GroqProvider(BaseLLMProvider):
    """Groq Cloud implementation using ultra-fast LLM models."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        if not self.api_key:
            raise ValueError("GROQ_API_KEY environment variable is required for GroqProvider")
        self.model = model or os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
        
        from groq import AsyncGroq
        self.client = AsyncGroq(api_key=self.api_key)

    async def stream_reasoning(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            stream=True,
            temperature=0.1,
            max_tokens=3000,
        )
        async for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                yield content

    async def generate_response(self, system_prompt: str, user_prompt: str) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            max_tokens=3000,
        )
        return response.choices[0].message.content or ""


class BedrockProvider(BaseLLMProvider):

    def __init__(
        self,
        region_name: Optional[str] = None,
        model_id: str = "anthropic.claude-sonnet-4-20250514-v1:0"
    ):
        self.region_name = region_name or os.getenv("AWS_REGION", "us-east-1")
        self.model_id = os.getenv("BEDROCK_MODEL_ID", model_id)
        import boto3
        self.client = boto3.client("bedrock-runtime", region_name=self.region_name)

    async def stream_reasoning(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.converse_stream(
                modelId=self.model_id,
                system=[{"text": system_prompt}],
                messages=[{"role": "user", "content": [{"text": user_prompt}]}],
                inferenceConfig={"temperature": 0.1, "maxTokens": 4096},
            )
        )
        stream = response.get("stream")
        if stream:
            for event in stream:
                if "contentBlockDelta" in event:
                    text = event["contentBlockDelta"]["delta"].get("text", "")
                    if text:
                        yield text

    async def generate_response(self, system_prompt: str, user_prompt: str) -> str:
        collected = []
        async for chunk in self.stream_reasoning(system_prompt, user_prompt):
            collected.append(chunk)
        return "".join(collected)


class MockLLMProvider(BaseLLMProvider):
    """
    High-fidelity local simulated provider for offline unit testing.
    Outputs realistic reasoning and valid structured diagnosis JSON.
    """

    async def stream_reasoning(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        # Determine scenario from diagnostic alerts in prompt
        is_pool = "POOL_SATURATION" in user_prompt or "100%" in user_prompt
        is_retry = "RETRY_SPIKE" in user_prompt and not is_pool

        if is_pool:
            chunks = [
                "Scanning service vitals across the dependency tree...\n",
                "Detected connection pool saturation on orders-service at 100% (20/20).\n",
                "Trace analysis reveals orders-service is waiting 1100ms on inventory-service.\n",
                "Conclusion: Latency propagation exhausted connection pool, blocking upstream gateway requests.\n\n",
                '```json\n{\n'
                '  "failure_mode": "CASCADING_FAILURE",\n'
                '  "root_cause_service": "inventory-service",\n'
                '  "blast_radius": ["orders-service", "api-gateway"],\n'
                '  "confidence_score": 0.96,\n'
                '  "summary": "Degraded latency in inventory-service filled caller connection pools, triggering cascading timeouts at the gateway.",\n'
                '  "evidence": ["orders-service connection pool at 100%", "api-gateway p99 jumped to 1450ms"],\n'
                '  "suggested_fix": {\n'
                '    "action": "Add Circuit Breaker & Bulkhead",\n'
                '    "target_service": "orders-service",\n'
                '    "recommendation": "Enforce a 400ms timeout on downstream calls to inventory-service and isolate connection pool capacity."\n'
                '  }\n'
                '}\n```'
            ]
        elif is_retry:
            chunks = [
                "Analyzing distributed call graph...\n",
                "Observed critical retry inflation: orders-service retrying inventory-service.\n",
                "Because downstream returned timeout, caller retried without backoff.\n",
                "Diagnosing: RETRY_STORM amplified load 3x on inventory-service.\n",
                "Generating root cause report...\n\n",
                '```json\n{\n'
                '  "failure_mode": "RETRY_STORM",\n'
                '  "root_cause_service": "inventory-service",\n'
                '  "blast_radius": ["orders-service", "api-gateway"],\n'
                '  "confidence_score": 0.94,\n'
                '  "summary": "Downstream timeouts induced un-throttled retry loops, creating a self-reinforcing retry storm.",\n'
                '  "evidence": ["Retries spiked from 0 to 45/sec", "orders-service RPS multiplied under failure"],\n'
                '  "suggested_fix": {\n'
                '    "action": "Implement Exponential Backoff with Jitter",\n'
                '    "target_service": "orders-service",\n'
                '    "recommendation": "Configure circuit breaker with exponential backoff and decorrelated jitter on orders-service -> inventory-service calls."\n'
                '  }\n'
                '}\n```'
            ]
        else:
            chunks = [
                "Telemetry within healthy bounds across all nodes.\n\n",
                '```json\n{\n'
                '  "failure_mode": "HEALTHY",\n'
                '  "root_cause_service": "none",\n'
                '  "blast_radius": [],\n'
                '  "confidence_score": 0.99,\n'
                '  "summary": "All services operating within normal latency and pool parameters.",\n'
                '  "evidence": ["p99 latency < 50ms", "pool saturation < 30%"],\n'
                '  "suggested_fix": {\n'
                '    "action": "Maintain Current Architecture",\n'
                '    "target_service": "all",\n'
                '    "recommendation": "No remediation required."\n'
                '  }\n'
                '}\n```'
            ]

        for chunk in chunks:
            yield chunk
            await asyncio.sleep(0.01)

    async def generate_response(self, system_prompt: str, user_prompt: str) -> str:
        collected = []
        async for chunk in self.stream_reasoning(system_prompt, user_prompt):
            collected.append(chunk)
        return "".join(collected)


def get_llm_provider(force_provider: Optional[str] = None) -> BaseLLMProvider:
    """
    Factory function resolving LLM provider according to environment settings.
    - If LLM_PROVIDER=bedrock: uses AWS Bedrock
    - If GROQ_API_KEY is available: uses Groq Cloud
    - Fallback: MockLLMProvider for offline reliability
    """
    provider_name = (force_provider or os.getenv("LLM_PROVIDER", "")).lower()

    if provider_name == "bedrock":
        logger.info("Initializing AWS Bedrock Provider")
        return BedrockProvider()
    elif provider_name == "mock":
        return MockLLMProvider()
    
    # Check if Groq key exists
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        logger.info("Initializing Groq Provider")
        return GroqProvider(api_key=groq_key)

    logger.warning("No GROQ_API_KEY or AWS Bedrock configured; falling back to MockLLMProvider")
    return MockLLMProvider()
