import asyncio
import os
import json
import sys
from datetime import datetime
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from anthropic import Anthropic

# System prompt directing Claude's reasoning process
AGENT_SYSTEM_PROMPT = """You are "Fraud Sentinel", an autonomous AI AML (Anti-Money Laundering) and fraud detection agent.
Your goal is to investigate transactions, identify fraud or money laundering, cite relevant regulations, and file Suspicious Activity Reports (SAR) if required.

You have access to a suite of analytical tools via an MCP Server. For each transaction ID assigned to you, you MUST follow this structured investigation protocol:
1. GET TRANSACTION DETAILS: Call `get_transaction` to understand the transaction details (amount, sender, receiver, time, location, device).
2. GET USER HISTORY BASELINE: Call `get_user_history` on the sender to establish their typical behavior (average transaction, typical location, device, risk level, PEP status).
3. ANALYZE ANOMALIES: Call `check_amount_anomaly`, `check_velocity`, and `check_geo_anomaly` to analyze the current transaction against the user's historical baseline.
4. INSPECT TRANSACTION NETWORK: If the transaction involves high-risk entities (like shell companies in tax havens), high-value transfers, or potential layering (splitting/merging), call `get_transaction_graph` and `detect_circular_transfers` to inspect the network.
5. CITE LAWS & REGULATIONS: If you discover any anomalies (velocity, structuring, impossible travel, circular transfers, or high-risk PEP transactions), use the `search_regulation` tool (RAG search) to find the exact rules from RBI, FATF, FinCEN, or SEBI that apply.
6. CALCULATE RISK & TAKE ACTION:
   - Determine a risk score (0 to 100).
   - If risk score is 50 or above, you MUST:
     a. Call `flag_transaction` with the risk score, reason, detailed explanation, and citations (as a JSON string array of regulation IDs).
     b. Call `draft_sar_report` to write a comprehensive SAR compliance draft.
     c. Call `notify_alert` with a summary alert message.
   - If risk score is below 50, you can conclude the transaction is low risk and let it pass (do not call `flag_transaction`).

Be extremely precise. Show your reasoning step-by-step. Citing regulations and explaining the math behind Z-scores or velocity counts is crucial for regulatory compliance audits."""

class FraudSentinelAgent:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.tool_logs = [] # To capture step-by-step tool execution history

    def log_tool_execution(self, tool_name: str, arguments: dict, result: str):
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool_name,
            "arguments": arguments,
            "result": result[:2000] + ("..." if len(result) > 2000 else "")
        }
        self.tool_logs.append(log_entry)
        print(f"[AGENT LOG] Called tool '{tool_name}' with args {arguments} -> Result length: {len(result)}")

    async def analyze_transaction(self, transaction_id: str) -> dict:
        self.tool_logs = []
        
        # Check if we should use high-fidelity demo/mock mode
        is_mock = not self.api_key or self.api_key.strip() == "" or self.api_key.upper() == "MOCK"

        # Stdio parameters to launch the Python MCP server
        python_exe = sys.executable or "python"
        server_params = StdioServerParameters(
            command=python_exe,
            args=[os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server", "mcp_server.py"))],
            env=os.environ.copy()
        )

        if is_mock:
            print("RUNNING IN HIGH-FIDELITY DEMO/MOCK MODE (NO CLAUDE API KEY)...")
            try:
                print(f"Connecting to MCP server using: {python_exe} ...")
                async with stdio_client(server_params) as (read_stream, write_stream):
                    async with ClientSession(read_stream, write_stream) as session:
                        # Initialize session
                        await session.initialize()
                        
                        # 1. Get transaction details
                        res_tx = await session.call_tool("get_transaction", {"transaction_id": transaction_id})
                        tx_data = json.loads(res_tx.content[0].text) if hasattr(res_tx, "content") else json.loads(str(res_tx))
                        self.log_tool_execution("get_transaction", {"transaction_id": transaction_id}, json.dumps(tx_data))
                        
                        if "error" in tx_data:
                            return {
                                "success": False,
                                "error": tx_data["error"],
                                "reasoning": "Transaction not found."
                            }
                            
                        sender_id = tx_data["sender_id"]
                        receiver_id = tx_data["receiver_id"]
                        amount = tx_data["amount"]
                        timestamp = tx_data["timestamp"]
                        location = tx_data["location"]
                        
                        # 2. Get user history
                        res_user = await session.call_tool("get_user_history", {"user_id": sender_id})
                        user_data = json.loads(res_user.content[0].text) if hasattr(res_user, "content") else json.loads(str(res_user))
                        self.log_tool_execution("get_user_history", {"user_id": sender_id}, json.dumps(user_data))
                        
                        risk_score = 0
                        reasoning_chain = []
                        citations = "[]"
                        flagged = False
                        
                        # Determine scenario logic based on transaction features/IDs
                        if sender_id == "U1004" or "VEL" in transaction_id or "200" in transaction_id:
                            # Scenario B: Velocity & Geo Anomaly
                            reasoning_chain.append("### Step-by-Step AML Risk Investigation Report\n\n**Subject**: Rajesh Kumar (U1004)\n\n1. **Baseline Assessment**: Rajesh Kumar is a MEDIUM risk tier user whose historical average transaction size is $80.00 (StdDev $20.00) primarily in Mumbai (IN-MUM) using device DEV_RK888.\n2. **Velocity & Amount Anomalies**: Executed check_amount_anomaly which returned Z-Score = 43.5. A transfer of $950 is an extreme statistical outlier. Next, check_velocity indicates 3 transactions within 60 minutes.\n3. **Geographical Impossible Travel**: Executed check_geo_anomaly which shows the user had a transaction in Mumbai (IN-MUM) 1 hour ago and current transaction is in Moscow (RU-MOW). Distance is ~5,000 km, requiring a speed of 60,000 km/h, which is physically impossible. Device DEV_HACKER_X is also a mismatch.\n4. **Regulation Citation**: Citing RBI Master KYC Direction 2016 Section 35 (Monitoring of Transactions) for failing to match the user spend profile and FATF Recommendation 20 for suspicious transfer characteristics.\n5. **Filing SAR**: Raising risk score to 95/100 and filing a Suspicious Activity Report.")
                            
                            # Run tools on the MCP server to capture logs and run business logic
                            res_a = await session.call_tool("check_amount_anomaly", {"user_id": sender_id, "amount": amount})
                            self.log_tool_execution("check_amount_anomaly", {"user_id": sender_id, "amount": amount}, json.dumps(json.loads(res_a.content[0].text)))
                            
                            res_v = await session.call_tool("check_velocity", {"user_id": sender_id, "current_tx_timestamp": timestamp})
                            self.log_tool_execution("check_velocity", {"user_id": sender_id, "current_tx_timestamp": timestamp}, json.dumps(json.loads(res_v.content[0].text)))
                            
                            res_g = await session.call_tool("check_geo_anomaly", {"user_id": sender_id, "current_tx_timestamp": timestamp, "current_location": location})
                            self.log_tool_execution("check_geo_anomaly", {"user_id": sender_id, "current_tx_timestamp": timestamp, "current_location": location}, json.dumps(json.loads(res_g.content[0].text)))
                            
                            cit_res = await session.call_tool("search_regulation", {"query": "monitoring of transactions impossible travel speed"})
                            citations_data = json.loads(cit_res.content[0].text) if hasattr(cit_res, "content") else json.loads(str(cit_res))
                            citations = json.dumps(citations_data)
                            self.log_tool_execution("search_regulation", {"query": "monitoring of transactions impossible travel speed"}, citations)
                            
                            risk_score = 95
                            reason = "Critical Velocity & Geographical Anomaly (Impossible Travel to RU-MOW)"
                            explanation = reasoning_chain[0]
                            flagged = True
                            
                            await session.call_tool("flag_transaction", {
                                "transaction_id": transaction_id,
                                "risk_score": risk_score,
                                "reason": reason,
                                "explanation": explanation,
                                "citations_json": citations
                            })
                            self.log_tool_execution("flag_transaction", {"transaction_id": transaction_id, "risk_score": risk_score}, "Transaction flagged in database.")
                            
                            res_sar = await session.call_tool("draft_sar_report", {
                                "transaction_id": transaction_id,
                                "agent_notes": "Rajesh Kumar's account compromised. Transactions initiated from Moscow, Russia within minutes of a Mumbai transaction. Speed required indicates account hijacking/credential theft."
                            })
                            self.log_tool_execution("draft_sar_report", {"transaction_id": transaction_id}, "SAR compliance report drafted.")
                            
                            await session.call_tool("notify_alert", {
                                "message": f"🚨 CRITICAL AML ALERT: Impossible travel velocity flagged for Rajesh Kumar (U1004). ${amount} transfer from Moscow, Russia. Risk score: 95/100."
                            })
                            self.log_tool_execution("notify_alert", {"message": "Alert dispatched"}, "Alert logged and sent.")
                            
                        elif sender_id == "U1009" or "STR" in transaction_id or "300" in transaction_id:
                            # Scenario C: Structuring / Smurfing
                            reasoning_chain.append("### Step-by-Step AML Risk Investigation Report\n\n**Subject**: Sunita Sharma (U1009)\n\n1. **Baseline Assessment**: Sunita is a HIGH risk tier user who spends average $50.00 in Delhi (IN-DEL).\n2. **Velocity & Amount Anomalies**: Executed check_velocity which revealed multiple transactions in rapid succession: $9,900, $9,850, and $9,950 to external account ACC_EXT_LAUND_881, totaling $29,670 within a 10-minute window.\n3. **Pattern Identification (Structuring)**: The transaction values are systematically designed to remain just below the $10,000 Currency Transaction Report (CTR) regulatory threshold.\n4. **Regulation Citation**: Citing FinCEN Structuring Rules (31 U.S.C. 5324) which makes it a criminal offense to structure transactions to evade reporting limits, and RBI KYC Direction Section 38 (Suspicious Transaction Reporting).\n5. **Filing SAR**: Raising risk score to 98/100 and filing a Suspicious Activity Report for structuring/smurfing.")
                            
                            res_a = await session.call_tool("check_amount_anomaly", {"user_id": sender_id, "amount": amount})
                            self.log_tool_execution("check_amount_anomaly", {"user_id": sender_id, "amount": amount}, json.dumps(json.loads(res_a.content[0].text)))
                            
                            res_v = await session.call_tool("check_velocity", {"user_id": sender_id, "current_tx_timestamp": timestamp})
                            self.log_tool_execution("check_velocity", {"user_id": sender_id, "current_tx_timestamp": timestamp}, json.dumps(json.loads(res_v.content[0].text)))
                            
                            cit_res = await session.call_tool("search_regulation", {"query": "structuring smurfing evading reporting limit 10000"})
                            citations_data = json.loads(cit_res.content[0].text) if hasattr(cit_res, "content") else json.loads(str(cit_res))
                            citations = json.dumps(citations_data)
                            self.log_tool_execution("search_regulation", {"query": "structuring smurfing evading reporting limit 10000"}, citations)
                            
                            risk_score = 98
                            reason = "Structuring Evasion Pattern (Multiple transfers just under $10,000 threshold)"
                            explanation = reasoning_chain[0]
                            flagged = True
                            
                            await session.call_tool("flag_transaction", {
                                "transaction_id": transaction_id,
                                "risk_score": risk_score,
                                "reason": reason,
                                "explanation": explanation,
                                "citations_json": citations
                            })
                            self.log_tool_execution("flag_transaction", {"transaction_id": transaction_id, "risk_score": risk_score}, "Transaction flagged in database.")
                            
                            await session.call_tool("draft_sar_report", {
                                "transaction_id": transaction_id,
                                "agent_notes": "Sunita Sharma initiated 3 consecutive transfers of ~$9,900 each to the same counterparty within minutes, totaling $29,670. This represents a classic smurfing structuring pattern to bypass the regulatory CTR limits."
                            })
                            self.log_tool_execution("draft_sar_report", {"transaction_id": transaction_id}, "SAR compliance report drafted.")
                            
                            await session.call_tool("notify_alert", {
                                "message": f"🚨 CRITICAL AML ALERT: Structuring/smurfing pattern flagged for Sunita Sharma (U1009). 3 transfers totaling $29,670 to ACC_EXT_LAUND_881. Risk score: 98/100."
                            })
                            self.log_tool_execution("notify_alert", {"message": "Alert dispatched"}, "Alert logged and sent.")
                            
                        elif sender_id in ["U1015", "U1020", "U1021", "U1022", "U1023", "U1024", "U1025"] or "PIG" in transaction_id or "LOOP" in transaction_id or "400" in transaction_id:
                            # Scenario D: Pig-Butchering layered circular transfers
                            reasoning_chain.append("### Step-by-Step AML Risk Investigation Report\n\n**Subject**: Multi-hop Layering Network (Pig-Butchering Loop)\n\n1. **Baseline Assessment**: Inspected Broker Ltd (U1020), a HIGH risk shell company in Cayman Islands. Received $85,000 from victim U1015 (Arthur Dent).\n2. **Network Routing Analysis**: Invoked `get_transaction_graph` and `detect_circular_transfers` starting from U1020. Found a layered directed graph that splits funds into offshore jurisdictions (Panama, Cyprus, Hong Kong, Singapore) and aggregates them to consolidator U1025, which immediately sends them back to U1020.\n3. **Loop Detection**: The network loop is verified: U1020 -> U1021/1022 -> U1023/1024 -> U1025 -> U1020. This is a classic Layering pattern used to clean illicit funds and obscure originator identity (Pig-Butchering).\n4. **Regulation Citation**: Citing FATF Recommendation 10 (Customer Due Diligence for high-risk accounts), FATF Recommendation 16 (Travel Rule - payment chain tracing), and AML Layering principles.\n5. **Filing SAR**: Raising risk score to 100/100 and filing a Suspicious Activity Report for circular money laundering.")
                            
                            res_g = await session.call_tool("get_transaction_graph", {"start_user_id": sender_id})
                            self.log_tool_execution("get_transaction_graph", {"start_user_id": sender_id}, json.dumps(json.loads(res_g.content[0].text)))
                            
                            res_c = await session.call_tool("detect_circular_transfers", {"start_user_id": sender_id})
                            self.log_tool_execution("detect_circular_transfers", {"start_user_id": sender_id}, json.dumps(json.loads(res_c.content[0].text)))
                            
                            cit_res = await session.call_tool("search_regulation", {"query": "layering circular laundering shell company"})
                            citations_data = json.loads(cit_res.content[0].text) if hasattr(cit_res, "content") else json.loads(str(cit_res))
                            citations = json.dumps(citations_data)
                            self.log_tool_execution("search_regulation", {"query": "layering circular laundering shell company"}, citations)
                            
                            risk_score = 100
                            reason = "Layered Money Laundering Network (Circular Flow Loop Detected)"
                            explanation = reasoning_chain[0]
                            flagged = True
                            
                            await session.call_tool("flag_transaction", {
                                "transaction_id": transaction_id,
                                "risk_score": risk_score,
                                "reason": reason,
                                "explanation": explanation,
                                "citations_json": citations
                            })
                            self.log_tool_execution("flag_transaction", {"transaction_id": transaction_id, "risk_score": risk_score}, "Transaction flagged in database.")
                            
                            await session.call_tool("draft_sar_report", {
                                "transaction_id": transaction_id,
                                "agent_notes": "Identified circular fund routing loop: U1020 -> U1021/U1022 -> U1023/U1024 -> U1025 -> U1020. Funds originate from U1015 (Arthur Dent), representing a $85,000 investment fraud victim cashout."
                            })
                            self.log_tool_execution("draft_sar_report", {"transaction_id": transaction_id}, "SAR compliance report drafted.")
                            
                            await session.call_tool("notify_alert", {
                                "message": f"🚨 CRITICAL AML ALERT: Circular money laundering loop detected for Broker Ltd (U1020). ${amount} volume cycled. Risk score: 100/100."
                            })
                            self.log_tool_execution("notify_alert", {"message": "Alert dispatched"}, "Alert logged and sent.")
                            
                        else:
                            # Normal transaction
                            reasoning_chain.append("### Step-by-Step AML Risk Investigation Report\n\n**Subject**: Standard Account\n\n1. **Baseline Assessment**: Transaction amount and frequency analyzed. User is LOW/MEDIUM risk. Amount is within typical standard deviation.\n2. **Velocity & Geographical Travel Checks**: Executed velocity checks and geo-travel speed check. No indicators of account compromise or impossible travel found.\n3. **Conclusion**: Approved. Low risk score (12/100). No regulatory reporting needed.")
                            
                            res_a = await session.call_tool("check_amount_anomaly", {"user_id": sender_id, "amount": amount})
                            self.log_tool_execution("check_amount_anomaly", {"user_id": sender_id, "amount": amount}, json.dumps(json.loads(res_a.content[0].text)))
                            
                            risk_score = 12
                            reason = "Normal customer transaction matching baseline profile."
                            explanation = reasoning_chain[0]
                            
                            await session.call_tool("flag_transaction", {
                                "transaction_id": transaction_id,
                                "risk_score": risk_score,
                                "reason": reason,
                                "explanation": explanation,
                                "citations_json": "[]"
                            })
                            self.log_tool_execution("flag_transaction", {"transaction_id": transaction_id, "risk_score": risk_score}, "Transaction approved in database.")
                            
                        return {
                            "success": True,
                            "transaction_id": transaction_id,
                            "risk_score": risk_score,
                            "flagged": flagged,
                            "reasoning": reasoning_chain[0],
                            "logs": self.tool_logs
                        }
            except Exception as e:
                return {
                    "success": False,
                    "error": f"Failed in mock/demo mode: {str(e)}",
                    "reasoning": "Error executing local MCP mock tools."
                }

        # Otherwise run standard Claude reasoning loop
        try:
            print(f"Connecting to MCP server using: {python_exe} ...")
            async with stdio_client(server_params) as (read_stream, write_stream):
                async with ClientSession(read_stream, write_stream) as session:
                    # Initialize session
                    await session.initialize()
                    
                    # Discover tools from MCP server
                    discovered_tools_response = await session.list_tools()
                    mcp_tools = discovered_tools_response.tools
                    
                    # Convert to Claude API tool structure
                    claude_tools = []
                    for t in mcp_tools:
                        claude_tools.append({
                            "name": t.name,
                            "description": t.description,
                            "input_schema": t.inputSchema
                        })
                    
                    # Start communication with Anthropic Claude API
                    client = Anthropic(api_key=self.api_key)
                    
                    # We start the messaging history
                    messages = [
                        {
                            "role": "user",
                            "content": f"Investigate transaction ID: {transaction_id} using your compliance tools. Follow the audit protocol."
                        }
                    ]
                    
                    max_loops = 12
                    loop_cnt = 0
                    risk_score = 0
                    flagged = False
                    reasoning_chain = []

                    while loop_cnt < max_loops:
                        loop_cnt += 1
                        
                        # Call Claude
                        response = client.messages.create(
                            model="claude-3-5-sonnet-20241022",
                            max_tokens=4000,
                            system=AGENT_SYSTEM_PROMPT,
                            tools=claude_tools,
                            messages=messages
                        )
                        
                        # Process text content
                        for block in response.content:
                            if block.type == "text":
                                reasoning_chain.append(block.text)
                                
                        # Check for tool use
                        tool_calls = [b for b in response.content if b.type == "tool_use"]
                        
                        if not tool_calls:
                            # Claude is finished thinking
                            break
                            
                        # Add assistant's response with tool calls to history
                        messages.append({
                            "role": "assistant",
                            "content": response.content
                        })
                        
                        tool_responses = []
                        for tool_call in tool_calls:
                            name = tool_call.name
                            args = tool_call.input
                            call_id = tool_call.id
                            
                            # Execute the tool on the MCP server
                            try:
                                result_obj = await session.call_tool(name, args)
                                
                                # Convert result to string
                                if hasattr(result_obj, "content"):
                                    tool_result_str = "\n".join([c.text for c in result_obj.content if hasattr(c, "text")])
                                else:
                                    tool_result_str = str(result_obj)
                                    
                            except Exception as tool_err:
                                tool_result_str = json.dumps({"error": f"Tool execution failed: {str(tool_err)}"})
                                
                            self.log_tool_execution(name, args, tool_result_str)
                            
                            tool_responses.append({
                                "type": "tool_result",
                                "tool_use_id": call_id,
                                "content": tool_result_str
                            })
                            
                            # Intercept details to capture risk score if flagged
                            if name == "flag_transaction":
                                risk_score = args.get("risk_score", 0)
                                flagged = True
                        
                        # Add tool responses to history
                        messages.append({
                            "role": "user",
                            "content": tool_responses
                        })
                        
                    full_reasoning = "\n\n".join(reasoning_chain)
                    
                    return {
                        "success": True,
                        "transaction_id": transaction_id,
                        "risk_score": risk_score,
                        "flagged": flagged or (risk_score >= 50),
                        "reasoning": full_reasoning,
                        "logs": self.tool_logs
                    }
                    
        except Exception as conn_err:
            return {
                "success": False,
                "error": f"Failed to run agent loop: {str(conn_err)}",
                "reasoning": f"MCP connection error. Verify if the server script is syntax-valid and dependencies are loaded."
            }

if __name__ == "__main__":
    # Test script standalone (assumes API key exists in environment)
    if len(sys.argv) < 2:
        print("Usage: python fraud_agent.py <transaction_id>")
        sys.exit(1)
        
    tx_id = sys.argv[1]
    agent = FraudSentinelAgent()
    
    print(f"Starting async analysis for transaction {tx_id}...")
    result = asyncio.run(agent.analyze_transaction(tx_id))
    print("\n========= RESULTS =========")
    print(json.dumps(result, indent=2))
