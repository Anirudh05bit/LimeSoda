import asyncio
import os
import sys

# Add root folder to sys.path to enable imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from agent.fraud_agent import FraudSentinelAgent

async def run_all():
    # Instantiate agent in mock mode
    agent = FraudSentinelAgent(api_key="MOCK")
    
    scenarios = ["TX2002", "TX3001", "TX4001"]
    
    print("====================================================")
    print("RUNNING AI AGENT ANALYSIS ON PRIMARY AML SCENARIOS")
    print("====================================================")
    
    for tx_id in scenarios:
        print(f"\n---> Analyzing Transaction {tx_id}...")
        result = await agent.analyze_transaction(tx_id)
        if result.get("success"):
            print(f"[OK] Success! Risk Score: {result['risk_score']}/100 | Flagged: {result['flagged']}")
            print(f"Reasoning summary: {result['reasoning'][:120]}...")
        else:
            print(f"[ERROR] Failed: {result.get('error')}")
            print(f"Details: {result.get('reasoning')}")
    print("\n====================================================")
    print("ALL ANALYSES COMPLETED!")
    print("====================================================")

if __name__ == "__main__":
    asyncio.run(run_all())
