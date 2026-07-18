import os
import json
from contextlib import asynccontextmanager
from typing import Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import GROQ_API_KEY, FASTAPI_HOST, FASTAPI_PORT
from mcp_client import MCPClient
from rag.pipeline import RagPipeline
from agents.detection_agent import DetectionAgent
from agents.compliance_agent import ComplianceAgent
from demo.scenarios import SCENARIOS, get_scenario_by_id
from slack.notifier import send_slack_alert

groq_client = None
rag: RagPipeline | None = None
mcp: MCPClient | None = None


class RunScenarioRequest(BaseModel):
    scenario_id: str


class RunDetectionRequest(BaseModel):
    customer_id: str


class RunComplianceRequest(BaseModel):
    customer_id: str
    detection_findings: dict[str, Any]


class SlackAlertRequest(BaseModel):
    customer_id: str
    transaction_id: str
    risk_score: float
    detection_reason: str
    sar_summary: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    global groq_client, rag, mcp

    if GROQ_API_KEY:
        try:
            from groq import Groq
            groq_client = Groq(api_key=GROQ_API_KEY)
        except ImportError:
            print("[main] groq not installed, LLM features will use rule-based fallback")
            groq_client = None
    else:
        print("[main] GROQ_API_KEY not set, LLM features will use rule-based fallback")
        groq_client = None

    rag = RagPipeline()
    mcp = MCPClient()
    try:
        await mcp.initialize()
        print("[main] Connected to MCP server")
    except Exception as e:
        print(f"[main] Failed to connect to MCP server: {e}")
        print("[main] Some features will be unavailable")

    yield


app = FastAPI(
    title="Fraud Sentinel API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "groq_connected": groq_client is not None,
        "mcp_connected": mcp is not None,
        "rag_ready": rag is not None,
    }


@app.get("/scenarios")
async def list_scenarios():
    return {"scenarios": [s.__dict__ for s in SCENARIOS]}


@app.post("/scenarios/run")
async def run_scenario(req: RunScenarioRequest):
    scenario = get_scenario_by_id(req.scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found")

    if not mcp:
        raise HTTPException(status_code=503, detail="MCP client not initialized")

    detection_agent = DetectionAgent(mcp, groq_client)
    compliance_agent = ComplianceAgent(mcp, rag, groq_client)

    detection_findings = await detection_agent.run(scenario.customer_id)
    compliance_findings = await compliance_agent.run(detection_findings)

    return {
        "scenario": scenario.__dict__,
        "detection": detection_findings,
        "compliance": compliance_findings,
    }


@app.post("/detection/run")
async def run_detection(req: RunDetectionRequest):
    if not mcp:
        raise HTTPException(status_code=503, detail="MCP client not initialized")

    agent = DetectionAgent(mcp, groq_client)
    findings = await agent.run(req.customer_id)
    return findings


@app.post("/compliance/run")
async def run_compliance(req: RunComplianceRequest):
    if not mcp or not rag:
        raise HTTPException(status_code=503, detail="MCP client or RAG not initialized")

    agent = ComplianceAgent(mcp, rag, groq_client)
    findings = await agent.run(req.detection_findings)
    return findings


@app.get("/rag/search")
async def rag_search(query: str, limit: int = 5):
    if not rag:
        raise HTTPException(status_code=503, detail="RAG not initialized")

    results = rag.search(query, limit)
    return {"query": query, "results": results}


@app.post("/alerts/slack")
async def slack_alert(req: SlackAlertRequest):
    result = await send_slack_alert(
        customer_id=req.customer_id,
        transaction_id=req.transaction_id,
        risk_score=req.risk_score,
        detection_reason=req.detection_reason,
        sar_summary=req.sar_summary,
    )
    return result


@app.get("/tools/list")
async def list_mcp_tools():
    if not mcp:
        raise HTTPException(status_code=503, detail="MCP client not initialized")
    return {"tools": []}
