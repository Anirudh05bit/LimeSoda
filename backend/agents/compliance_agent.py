from typing import Any
from mcp_client import MCPClient
from rag.pipeline import RagPipeline


class ComplianceAgent:
    def __init__(self, mcp: MCPClient, rag: RagPipeline, groq_client: Any):
        self.mcp = mcp
        self.rag = rag
        self.groq = groq_client

    async def run(self, detection_findings: dict[str, Any]) -> dict[str, Any]:
        customer_id = detection_findings.get("customer_id", "")
        assessment = detection_findings.get("assessment", {})
        detection_summary = assessment.get("summary", "No detection data")

        reg_query = self._build_regulation_query(detection_findings)
        regulations = self.rag.search(reg_query, limit=5)

        compliance_analysis = self._generate_compliance_analysis(
            detection_findings, regulations
        )

        sar = await self.mcp.generate_sar(
            customerId=customer_id,
            detectionSummary=detection_summary,
            complianceAnalysis=compliance_analysis,
            riskScore=assessment.get("riskScore", 0),
            riskLevel=assessment.get("riskLevel", "LOW"),
            recommendedAction=assessment.get("recommendedAction", "REVIEW"),
            relevantRegulations=[
                {"docId": r["docId"], "title": r["title"], "excerpt": r["excerpt"]}
                for r in regulations
            ],
        )

        if assessment.get("riskLevel") == "HIGH":
            slack_result = await self._send_slack_alert(
                customer_id, detection_findings, assessment, sar
            )
        else:
            slack_result = {"status": "skipped", "message": "Not a high-risk case"}

        return {
            "customerId": customer_id,
            "regulationsRetrieved": regulations,
            "complianceAnalysis": compliance_analysis,
            "sar": sar,
            "slackAlert": slack_result,
        }

    def _build_regulation_query(self, findings: dict[str, Any]) -> str:
        parts = []
        assessment = findings.get("assessment", {})
        detection_reasons = assessment.get("detectionReasons", [])

        for reason in detection_reasons:
            if "structuring" in reason.lower():
                parts.append("structuring CTR filing requirements")
            if "circular" in reason.lower() or "cycle" in reason.lower():
                parts.append("circular fund flow money laundering")
            if "velocity" in reason.lower():
                parts.append("velocity alert investigation")
            if "impossible travel" in reason.lower() or "geo" in reason.lower():
                parts.append("geographic anomaly impossible travel")
            if "amount anomaly" in reason.lower():
                parts.append("transaction amount anomaly AML")

        if not parts:
            parts.append("AML compliance customer due diligence")

        return " ".join(parts[:3])

    def _generate_compliance_analysis(self, findings: dict[str, Any], regulations: list[dict]) -> str:
        assessment = findings.get("assessment", {})
        reasons = assessment.get("detectionReasons", [])
        risk_level = assessment.get("riskLevel", "LOW")

        if len(reasons) == 0:
            return (
                "Compliance Review: No suspicious indicators detected. "
                "The transaction pattern is consistent with normal customer activity. "
                "No regulatory concerns identified."
            )

        analysis_parts = []
        reg_refs = [f"'{r['title']}' ({r['docId']})" for r in regulations[:3]]

        reg_section = "Relevant Regulations:\n" + "\n".join(f"- {ref}" for ref in reg_refs) if reg_refs else ""

        analysis_parts.append(
            f"Compliance Analysis ({risk_level} Risk):\n"
            f"Detection Findings: {'; '.join(reasons)}\n"
            f"{reg_section}\n\n"
            f"Assessment: The transaction pattern exhibits {len(reasons)} risk indicator(s). "
            f"This warrants further investigation under applicable AML/CFT regulations."
        )

        return "\n\n".join(analysis_parts)

    async def _send_slack_alert(
        self, customer_id: str, findings: dict[str, Any],
        assessment: dict[str, Any], sar: dict[str, Any]
    ) -> dict:
        graph = findings.get("graph", {})
        txns = graph.get("edges", []) if isinstance(graph, dict) else []
        txn_id = txns[0].get("metadata", {}).get("transaction_id", "unknown") if txns else "unknown"

        result = await self.mcp.send_slack_alert(
            customerId=customer_id,
            transactionId=txn_id,
            riskScore=assessment.get("riskScore", 0),
            detectionReason=assessment.get("summary", ""),
            sarSummary=sar.get("narrative", "")[:300] if isinstance(sar, dict) else "",
        )
        return result
