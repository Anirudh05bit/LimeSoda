import json
import httpx
from typing import Any
from config import MCP_SERVER_URL


class MCPClient:
    def __init__(self, base_url: str = MCP_SERVER_URL):
        self.base_url = base_url
        self.session_id: str | None = None
        self._request_id = 0

    async def _request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._request_id += 1
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                self.base_url,
                headers=headers,
                json={"jsonrpc": "2.0", "id": self._request_id, "method": method, "params": params or {}},
            )
            ns = resp.headers.get("Mcp-Session-Id")
            if ns:
                self.session_id = ns
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"MCP error: {data['error']}")
            return data.get("result", {})

    async def initialize(self):
        return await self._request("initialize", {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "fraud-sentinel", "version": "1.0.0"},
        })

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        result = await self._request("tools/call", {"name": name, "arguments": arguments})
        content = result.get("content", [])
        if content and content[0].get("text"):
            return json.loads(content[0]["text"])
        return result

    async def read_resource(self, uri: str) -> Any:
        result = await self._request("resources/read", {"uri": uri})
        contents = result.get("contents", [])
        if contents and contents[0].get("text"):
            return json.loads(contents[0]["text"])
        return result

    async def get_customer_profile(self, customer_id: str) -> dict[str, Any]:
        return await self.read_resource(f"customer://{customer_id}/profile")

    async def get_case_evidence(self, case_id: str) -> dict[str, Any]:
        return await self.read_resource(f"case://{case_id}/evidence")

    async def calculate_zscore(self, customer_id: str) -> dict[str, Any]:
        return await self.call_tool("calculate_zscore", {"customerId": customer_id})

    async def check_velocity(self, customer_id: str, window_hours: int = 24) -> dict[str, Any]:
        return await self.call_tool("check_velocity", {"customerId": customer_id, "windowHours": window_hours})

    async def geo_check(self, customer_id: str) -> dict[str, Any]:
        return await self.call_tool("geo_check", {"customerId": customer_id})

    async def detect_structuring(self, customer_id: str, threshold: int = 10000) -> dict[str, Any]:
        return await self.call_tool("detect_structuring", {"customerId": customer_id, "threshold": threshold})

    async def customer_history(self, customer_id: str) -> dict[str, Any]:
        return await self.call_tool("customer_history", {"customerId": customer_id})

    async def build_transaction_graph(self, customer_id: str) -> dict[str, Any]:
        return await self.call_tool("build_transaction_graph", {"customerId": customer_id})

    async def detect_cycles(self, customer_id: str) -> dict[str, Any]:
        return await self.call_tool("detect_cycles", {"customerId": customer_id})

    async def search_regulations(self, query: str, limit: int = 5) -> dict[str, Any]:
        return await self.call_tool("search_regulations", {"query": query, "limit": limit})

    async def generate_sar(self, **kwargs) -> dict[str, Any]:
        return await self.call_tool("generate_sar", kwargs)

    async def send_slack_alert(self, **kwargs) -> dict[str, Any]:
        return await self.call_tool("send_slack_alert", kwargs)

    async def score_alert(self, customer_id: str, severity: str) -> dict[str, Any]:
        return await self.call_tool("score_alert", {"customerId": customer_id, "alertSeverity": severity})

    async def expand_entity_graph(self, customer_id: str) -> dict[str, Any]:
        return await self.call_tool("expand_entity_graph", {"customerId": customer_id})
