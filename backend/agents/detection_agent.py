from typing import Any
from mcp_client import MCPClient


class DetectionAgent:
    def __init__(self, mcp: MCPClient, groq_client: Any):
        self.mcp = mcp
        self.groq = groq_client
        self.findings: dict[str, Any] = {}
        self.evidence: list[dict[str, Any]] = []

    async def run(self, customer_id: str) -> dict[str, Any]:
        self.evidence = []
        self.findings = {"customer_id": customer_id}

        customer_info = await self.mcp.customer_history(customer_id)
        self.findings["customer"] = customer_info.get("customer", {})
        self.evidence.append({"tool": "customer_history", "result": customer_info})

        zscore = await self.mcp.calculate_zscore(customer_id)
        self.findings["zscore"] = zscore
        self.evidence.append({"tool": "calculate_zscore", "result": zscore})

        velocity = await self.mcp.check_velocity(customer_id)
        self.findings["velocity"] = velocity
        self.evidence.append({"tool": "check_velocity", "result": velocity})

        geo = await self.mcp.geo_check(customer_id)
        self.findings["geo"] = geo
        self.evidence.append({"tool": "geo_check", "result": geo})

        structuring = await self.mcp.detect_structuring(customer_id)
        self.findings["structuring"] = structuring
        self.evidence.append({"tool": "detect_structuring", "result": structuring})

        cycles = await self.mcp.detect_cycles(customer_id)
        self.findings["cycles"] = cycles
        self.evidence.append({"tool": "detect_cycles", "result": cycles})

        graph = await self.mcp.build_transaction_graph(customer_id)
        self.findings["graph"] = graph
        self.evidence.append({"tool": "build_transaction_graph", "result": graph})

        assessment = self._generate_assessment()
        self.findings["assessment"] = assessment

        return self.findings

    def _generate_assessment(self) -> dict[str, Any]:
        reasons: list[str] = []
        risk_points = 0

        z = self.findings.get("zscore", {})
        anomalous = (z.get("anomalousTransactions") or 0) if isinstance(z, dict) else 0
        if anomalous > 0:
            reasons.append(f"Amount anomaly: {anomalous} transaction(s) with |z| > 2")
            risk_points += 20

        v = self.findings.get("velocity", {})
        flagged_v = v.get("flagged", False) if isinstance(v, dict) else False
        if flagged_v:
            count = v.get("transactionCount", 0)
            reasons.append(f"Velocity alert: {count} transactions in {v.get('timeWindowHours', 24)}h")
            risk_points += 25

        g = self.findings.get("geo", {})
        impossible = (g.get("impossibleTravelEvents") or 0) if isinstance(g, dict) else 0
        if impossible > 0:
            reasons.append(f"Impossible travel: {impossible} event(s) detected")
            risk_points += 30

        s = self.findings.get("structuring", {})
        accounts_flagged = (s.get("accountsFlagged") or 0) if isinstance(s, dict) else 0
        if accounts_flagged > 0:
            reasons.append(f"Structuring: {accounts_flagged} account(s) with below-threshold patterns")
            risk_points += 25

        c = self.findings.get("cycles", {})
        cycles_count = (c.get("cyclesDetected") or 0) if isinstance(c, dict) else 0
        if cycles_count > 0:
            reasons.append(f"Circular flow: {cycles_count} cycle(s) detected in transaction graph")
            risk_points += 30

        risk_score = min(100, risk_points)
        if risk_score >= 70:
            risk_level = "HIGH"
            recommendation = "BLOCK"
        elif risk_score >= 40:
            risk_level = "MEDIUM"
            recommendation = "REVIEW"
        else:
            risk_level = "LOW"
            recommendation = "APPROVE"

        return {
            "riskScore": risk_score,
            "riskLevel": risk_level,
            "recommendedAction": recommendation,
            "detectionReasons": reasons,
            "summary": "; ".join(reasons) if reasons else "No anomalies detected",
        }
