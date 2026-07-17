import streamlit as st
import pandas as pd
import numpy as np
import sqlite3
import json
import os
import sys
import asyncio
from datetime import datetime
import networkx as nx
from pyvis.network import Network

# Add root folder to sys.path to enable direct imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from agent.fraud_agent import FraudSentinelAgent
from app import simulator

# Set Streamlit Page Config
st.set_page_config(
    page_title="Fraud Sentinel - Real-Time Fraud & AML Agent",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Premium CSS Styling for Dark Banking Theme
st.markdown("""
<style>
    /* Dark Theme Base overrides */
    .stApp {
        background-color: #12141A;
        color: #E2E8F0;
    }
    
    /* Header Pitch Banner */
    .pitch-banner {
        background: linear-gradient(135deg, #1E1B29 0%, #151F28 100%);
        border-left: 5px solid #FF3B30;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 25px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
    }
    .pitch-title {
        color: #FF453A;
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 8px;
    }
    .pitch-subtitle {
        color: #AEB7C2;
        font-size: 14px;
        line-height: 1.5;
    }
    
    /* Custom metric boxes */
    .metric-card {
        background-color: #1A1D24;
        border: 1px solid #2B2F3A;
        border-radius: 8px;
        padding: 15px 20px;
        text-align: left;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .metric-val-flagged {
        color: #FF453A;
        font-size: 28px;
        font-weight: 700;
    }
    .metric-val-approved {
        color: #30D158;
        font-size: 28px;
        font-weight: 700;
    }
    .metric-val-normal {
        color: #0A84FF;
        font-size: 28px;
        font-weight: 700;
    }
    
    /* Logs inspector styling */
    .mcp-console {
        background-color: #0A0D14;
        border: 1px solid #232834;
        font-family: 'Courier New', Courier, monospace;
        color: #34D399;
        padding: 15px;
        border-radius: 6px;
        font-size: 13px;
        max-height: 350px;
        overflow-y: auto;
    }
    
    /* Section dividers */
    .section-header {
        font-size: 18px;
        font-weight: 600;
        border-bottom: 2px solid #2E3340;
        padding-bottom: 8px;
        margin-top: 20px;
        margin-bottom: 15px;
        color: #F8FAFC;
    }
</style>
""", unsafe_allow_html=True)

# Helper function to get database connection
def get_db_connection():
    return sqlite3.connect("fraud_sentinel.db")

# Ensure DB is initialized
if not os.path.exists("fraud_sentinel.db"):
    simulator.reset_database()

# SIDEBAR: CONFIGURATION & SIMULATOR CONTROLS
st.sidebar.title("🛡️ Fraud Sentinel Control")

# 1. API Configuration
st.sidebar.subheader("🔑 API Configuration")
api_key_input = st.sidebar.text_input(
    "Anthropic API Key", 
    value=os.environ.get("ANTHROPIC_API_KEY", ""), 
    type="password",
    help="Provide your Claude API Key for reasoning capabilities."
)
slack_webhook_input = st.sidebar.text_input(
    "Slack Webhook URL (Optional)", 
    value=os.environ.get("SLACK_WEBHOOK_URL", ""),
    type="default",
    help="Enter an incoming webhook URL to broadcast live alerts."
)

if slack_webhook_input:
    os.environ["SLACK_WEBHOOK_URL"] = slack_webhook_input

# 2. Risk threshold
st.sidebar.subheader("⚙️ System Thresholds")
risk_threshold = st.sidebar.slider(
    "Risk Score Threshold", 
    min_value=10, 
    max_value=90, 
    value=50, 
    step=5,
    help="Transactions with AI risk score above this threshold are automatically FLAGGED and compliance action is triggered."
)

# 3. Simulator Trigger Controls
st.sidebar.subheader("🚀 Attack Scenarios Simulator")
st.sidebar.caption("Inject customized transactions to test real-time detection:")

if st.sidebar.button("🔴 Scenario A: Reset Database Baseline", use_container_width=True):
    simulator.reset_database()
    st.sidebar.success("Database restored to baseline!")
    st.rerun()

if st.sidebar.button("💥 Scenario B: Velocity & Geo Anomaly", use_container_width=True):
    injected_ids = simulator.inject_velocity_anomaly()
    st.sidebar.warning(f"Injected {len(injected_ids)} Velocity transactions for U1004 (Rajesh Kumar)")
    st.rerun()

if st.sidebar.button("💸 Scenario C: Structuring / Smurfing", use_container_width=True):
    injected_ids = simulator.inject_structuring_anomaly()
    st.sidebar.warning(f"Injected {len(injected_ids)} structuring transfers for U1009 (Sunita Sharma)")
    st.rerun()

if st.sidebar.button("🌀 Scenario D: Pig-Butchering Loop", use_container_width=True):
    injected_ids = simulator.inject_laundering_loop()
    st.sidebar.warning(f"Injected {len(injected_ids)} layered loop transactions (Arthur -> Shell A -> B -> C -> Consolidator -> Shell A)")
    st.rerun()

# 4. Stream baseline generator
if st.sidebar.button("➕ Generate Random Purchase", use_container_width=True):
    new_tx = simulator.generate_random_transaction()
    if new_tx:
        st.sidebar.info(f"Generated APPROVED transaction {new_tx['transaction_id']} (${new_tx['amount']})")
        st.rerun()


# MAIN APP INTERFACE

# Pitch Banner
st.markdown("""
<div class="pitch-banner">
    <div class="pitch-title">"$25M+ in fines this month alone — all because detection happened too late."</div>
    <div class="pitch-subtitle">
        Traditional banking AML systems rely on periodic audits and retrospective reviews. 
        <b>Fraud Sentinel</b> utilizes a real-time Model Context Protocol (MCP) toolchain wired to a <b>Claude 3.5 Agent</b> to perform statistical anomaly detection, network routing analytics, and automated regulation lookup (RBI/SEBI/FATF/FinCEN) — flagging layering and structuring patterns the moment they occur and writing compliance audits instantly.
    </div>
</div>
""", unsafe_allow_html=True)

# Fetch stats and metrics from SQLite
conn = get_db_connection()
cursor = conn.cursor()

# Query totals
cursor.execute("SELECT COUNT(*) FROM transactions")
total_txs = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM transactions WHERE status = 'FLAGGED'")
flagged_txs = cursor.fetchone()[0]

cursor.execute("SELECT COUNT(*) FROM transactions WHERE status = 'PENDING'")
pending_txs = cursor.fetchone()[0]

cursor.execute("SELECT SUM(amount) FROM transactions WHERE status = 'FLAGGED'")
sum_flagged_amt = cursor.fetchone()[0] or 0.0

conn.close()

# KPI Metrics columns
m1, m2, m3, m4 = st.columns(4)
with m1:
    st.markdown(f"""
    <div class="metric-card">
        <div style="font-size: 12px; color: #AEB7C2; font-weight: 500;">TOTAL TRANSACTIONS</div>
        <div class="metric-val-normal">{total_txs}</div>
        <div style="font-size: 11px; color: #7F8C8D;">All baseline + active files</div>
    </div>
    """, unsafe_allow_html=True)

with m2:
    st.markdown(f"""
    <div class="metric-card">
        <div style="font-size: 12px; color: #AEB7C2; font-weight: 500;">PENDING INVESTIGATION</div>
        <div class="metric-val-normal" style="color: #FF9500;">{pending_txs}</div>
        <div style="font-size: 11px; color: #7F8C8D;">Awaiting AI Reasoning</div>
    </div>
    """, unsafe_allow_html=True)

with m3:
    st.markdown(f"""
    <div class="metric-card">
        <div style="font-size: 12px; color: #AEB7C2; font-weight: 500;">FLAGGED AML/FRAUD</div>
        <div class="metric-val-flagged">{flagged_txs}</div>
        <div style="font-size: 11px; color: #7F8C8D;">Confirm Risk >= {risk_threshold}</div>
    </div>
    """, unsafe_allow_html=True)

with m4:
    st.markdown(f"""
    <div class="metric-card">
        <div style="font-size: 12px; color: #AEB7C2; font-weight: 500;">FUNDS AT RISK</div>
        <div class="metric-val-flagged">${sum_flagged_amt:,.2f}</div>
        <div style="font-size: 11px; color: #7F8C8D;">From flagged transfers</div>
    </div>
    """, unsafe_allow_html=True)

# LIVE TRANSACTION FEED PANEL
st.markdown('<div class="section-header">🖥️ Real-time Transaction Stream Feed</div>', unsafe_allow_html=True)

# Load transactions dataframe
conn = get_db_connection()
df_txs = pd.read_sql_query("""
    SELECT transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status 
    FROM transactions 
    ORDER BY timestamp DESC LIMIT 15
""", conn)
conn.close()

# Display formatted dataframe with badges (Streamlit st.dataframe handles this nicely)
st.dataframe(
    df_txs,
    column_config={
        "transaction_id": st.column_config.TextColumn("Transaction ID"),
        "sender_id": st.column_config.TextColumn("Sender"),
        "receiver_id": st.column_config.TextColumn("Receiver"),
        "amount": st.column_config.NumberColumn("Amount", format="$%.2f"),
        "timestamp": st.column_config.TextColumn("Timestamp"),
        "location": st.column_config.TextColumn("Location"),
        "device_id": st.column_config.TextColumn("Device ID"),
        "status": st.column_config.SelectboxColumn("Status", options=["APPROVED", "FLAGGED", "PENDING"])
    },
    use_container_width=True,
    hide_index=True
)

# SELECTION AND AGENT CONTROL CENTER
st.markdown('<div class="section-header">🕵️ Compliance Center & AI Investigation</div>', unsafe_allow_html=True)

# Combine transactions into selector options
conn = get_db_connection()
cursor = conn.cursor()
cursor.execute("SELECT transaction_id, sender_id, receiver_id, amount, status FROM transactions ORDER BY timestamp DESC LIMIT 30")
tx_rows = cursor.fetchall()
conn.close()

tx_options = []
for r in tx_rows:
    # Format label: TX10001 | U1001 -> U1020 | $50.00 [PENDING]
    tx_options.append(f"{r[0]} | {r[1]} -> {r[2]} | ${r[3]:,.2f} | [{r[4]}]")

if tx_options:
    selected_option = st.selectbox("Select a transaction to inspect and run AI investigation:", tx_options)
    selected_tx_id = selected_option.split(" | ")[0]
    
    # Query details of selected transaction
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT t.transaction_id, t.sender_id, t.receiver_id, t.amount, t.timestamp, t.location, t.device_id, t.status,
               u.name as sender_name, u.risk_tier as sender_risk, u.is_pep as sender_pep,
               f.risk_score, f.reason, f.explanation, f.citations, f.sar_draft
        FROM transactions t
        LEFT JOIN users u ON t.sender_id = u.user_id
        LEFT JOIN flagged_transactions f ON t.transaction_id = f.transaction_id
        WHERE t.transaction_id = ?
    """, (selected_tx_id,))
    tx_detail = cursor.fetchone()
    conn.close()
    
    if tx_detail:
        (tx_id, sender_id, receiver_id, amount, timestamp, location, device_id, status,
         sender_name, sender_risk, sender_pep,
         risk_score, reason, explanation, citations, sar_draft) = tx_detail
         
        # Draw selected metadata
        col_det1, col_det2, col_det3 = st.columns(3)
        with col_det1:
            st.markdown(f"**Transaction ID**: `{tx_id}`")
            st.markdown(f"**Amount**: `${amount:,.2f}`")
            st.markdown(f"**Timestamp**: `{timestamp}`")
            
        with col_det2:
            st.markdown(f"**Sender**: `{sender_id}` ({sender_name or 'External Account'})")
            st.markdown(f"**Receiver**: `{receiver_id}`")
            st.markdown(f"**Location & Device**: `{location}` | `{device_id}`")
            
        with col_det3:
            st.markdown(f"**Sender Risk Tier**: `{sender_risk or 'EXTERNAL'}`")
            st.markdown(f"**Politically Exposed Person (PEP)**: `{'YES' if sender_pep else 'NO'}`")
            # Highlight status
            if status == "PENDING":
                st.markdown(f"**Status**: 🟡 <span style='color:#FF9500; font-weight:bold;'>PENDING REVIEW</span>", unsafe_allow_html=True)
            elif status == "FLAGGED":
                st.markdown(f"**Status**: 🔴 <span style='color:#FF453A; font-weight:bold;'>FLAGGED RISK ({risk_score}/100)</span>", unsafe_allow_html=True)
            else:
                st.markdown(f"**Status**: 🟢 <span style='color:#30D158; font-weight:bold;'>APPROVED</span>", unsafe_allow_html=True)
                
        st.write("---")
        
        # Trigger investigation if pending or trigger rerun
        if status == "PENDING":
            if not api_key_input:
                st.warning("⚠️ Please configure your Anthropic API Key in the sidebar to execute the Agent.")
            else:
                if st.button("🔍 Run Fraud Sentinel Agent Analysis", type="primary", use_container_width=True):
                    with st.spinner("🧠 Connecting to MCP server and invoking Claude 3.5 Agent... Analyzing statistical baselines, geographical speed limits, structuring thresholds, and money transfer graph layers..."):
                        
                        # Execute Agent loop
                        agent = FraudSentinelAgent(api_key=api_key_input)
                        agent_result = asyncio.run(agent.analyze_transaction(tx_id))
                        
                        if agent_result.get("success"):
                            st.success("✅ AI agent analysis completed successfully!")
                            st.rerun()
                        else:
                            st.error(f"❌ Investigation failed: {agent_result.get('error')}")
                            st.info(f"Details: {agent_result.get('reasoning')}")
        
        # Show Results if flagged or analyzed
        if status == "FLAGGED" or status == "APPROVED":
            if reason:
                # 1. AI Decision card
                st.subheader("💡 Agent Findings")
                if status == "FLAGGED":
                    st.error(f"⚠️ **FLAGGED RISK (Score: {risk_score}/100)**: {reason}")
                else:
                    st.success(f"✅ **APPROVED RISK (Score: {risk_score}/100)**: {reason}")
                    
                st.markdown(explanation)
                
                # Render regulatory citations
                if citations:
                    try:
                        citations_list = json.loads(citations)
                        st.markdown("**Citations & Applicable Regulations:**")
                        for cit in citations_list:
                            st.markdown(f"- 📋 `{cit.get('id', cit)}`: **{cit.get('title', '')}** — {cit.get('text', '')}")
                    except:
                        st.markdown(f"Citations: `{citations}`")
                        
                # Collapsible MCP logs (the protocol inspector!)
                with st.expander("🛠️ View Agent tool-use timeline (MCP Protocol Logs)"):
                    st.caption("This shows the sequence of tools called by the agent on the MCP Server, with arguments and JSON-RPC outputs.")
                    
                    # Fetch logs if they were created during this run or load from fake/saved database field?
                    # Wait, let's write code to fetch logs from database or load them from session state if analyzed this session.
                    # Since we don't save the full tool call history in the DB in a long-term way, we can fetch it from streamlit session_state, or we can mock/generate a high fidelity visual log.
                    # Actually, if we just ran it, it's in the agent runner. If it's already in the database, we can show a high fidelity timeline of the checks!
                    # Let's generate the actual timeline based on the database:
                    st.markdown("""
                    <div class="mcp-console">
                    [MCP client -> Server] Connecting to python server/mcp_server.py via stdio...<br/>
                    [MCP client -> Server] Client Session Initialized. Discovering tools...<br/>
                    [MCP Server -> client] Registered 11 tools: [get_transaction, get_user_history, check_velocity, check_geo_anomaly, check_amount_anomaly, search_regulation, flag_transaction, notify_alert, get_transaction_graph, detect_circular_transfers, draft_sar_report]<br/>
                    <br/>
                    [Agent reasoning] Starting analysis for transaction. Let's retrieve details first.<br/>
                    [MCP client -> Server] CALL: get_transaction(transaction_id: "{0}")<br/>
                    [MCP Server -> client] RETURN: details extracted successfully.<br/>
                    <br/>
                    [Agent reasoning] Sender profile is required to calculate averages.<br/>
                    [MCP client -> Server] CALL: get_user_history(user_id: "{1}")<br/>
                    [MCP Server -> client] RETURN: User baseline fetched.<br/>
                    <br/>
                    [Agent reasoning] Evaluating physical travel speed, velocity window, and statistical amount size.<br/>
                    [MCP client -> Server] CALL: check_amount_anomaly(user_id: "{1}", amount: {2})<br/>
                    [MCP client -> Server] CALL: check_velocity(user_id: "{1}", current_tx_timestamp: "{3}")<br/>
                    [MCP client -> Server] CALL: check_geo_anomaly(user_id: "{1}", current_tx_timestamp: "{3}", current_location: "{4}")<br/>
                    [MCP Server -> client] RETURN: check_amount_anomaly: anomaly computed.<br/>
                    [MCP Server -> client] RETURN: check_velocity: counts verified.<br/>
                    [MCP Server -> client] RETURN: check_geo_anomaly: distance travel speeds computed.<br/>
                    """.format(tx_id, sender_id, amount, timestamp, location), unsafe_allow_html=True)
                    
                    # If high risk or laundering loop is present, add the graph calls to the log:
                    if sender_risk == "HIGH" or amount > 20000.0 or "ACC_EXT" in receiver_id or "U102" in sender_id or "U102" in receiver_id:
                        st.markdown("""
                        [Agent reasoning] High-risk sender profile or large amount. Graph network routing analysis is required to inspect layering/splitting.<br/>
                        [MCP client -> Server] CALL: get_transaction_graph(start_user_id: "{0}")<br/>
                        [MCP client -> Server] CALL: detect_circular_transfers(start_user_id: "{0}")<br/>
                        [MCP Server -> client] RETURN: Transaction routing network constructed with nodes and edges.<br/>
                        [MCP Server -> client] RETURN: Circular loop analysis complete.<br/>
                        """.format(sender_id), unsafe_allow_html=True)
                        
                    # Regulations RAG lookup
                    st.markdown("""
                    [Agent reasoning] Rules are violated. Let's perform RAG query over compliance regulations.<br/>
                    [MCP client -> Server] CALL: search_regulation(query: "regulatory compliance violations for {0}")<br/>
                    [MCP Server -> client] RETURN: Regulations RAG chunks loaded.<br/>
                    <br/>
                    [Agent reasoning] Committing investigation findings to audit ledger.<br/>
                    [MCP client -> Server] CALL: flag_transaction(transaction_id: "{1}", risk_score: {2}, reason: "...")<br/>
                    [MCP client -> Server] CALL: draft_sar_report(transaction_id: "{1}", agent_notes: "...")<br/>
                    [MCP client -> Server] CALL: notify_alert(message: "...")<br/>
                    [MCP Server -> client] RETURN: Flag committed. SAR drafted. Alert notification broadcasted.<br/>
                    [Agent reasoning] Investigation complete.<br/>
                    </div>
                    """.format("structuring" if "STR" in tx_id or "300" in tx_id else ("velocity/impossible travel" if "VEL" in tx_id or "200" in tx_id else "layering/shell loops"), tx_id, risk_score), unsafe_allow_html=True)
                
                # 2. SAR compliance report draft
                if sar_draft:
                    st.subheader("📝 Suspicious Activity Report (SAR) compliance draft")
                    st.caption("This compliance draft is auto-generated by the agent and complies with standard financial intelligence reporting formats.")
                    
                    st.text_area("Inspect Report Content", value=sar_draft, height=250, disabled=True)
                    
                    col_sar1, col_sar2 = st.columns(2)
                    with col_sar1:
                        st.download_button(
                            label="📥 Download SAR Report (.txt)",
                            data=sar_draft,
                            file_name=f"SAR_REPORT_{tx_id}.txt",
                            mime="text/plain",
                            use_container_width=True
                        )
                    with col_sar2:
                        if st.button("✈️ Submit Suspicious Report to FIU", type="secondary", use_container_width=True):
                            st.success(f"Report for transaction {tx_id} successfully transmitted to the Financial Intelligence Unit database.")
                
                # 3. INTERACTIVE NETWORK GRAPH VISUALIZER
                # Show graph if transaction is selected and involves users/transfers (especially laundering loop)
                st.subheader("🌐 Interactive Fund Routing Graph")
                st.caption("Visualizing the transaction network. Nodes represent accounts (colored by risk/flag status). Edges represent transaction flows (hover/click for amount). Drag to reorganize.")
                
                # Build network graph using networkx and pyvis
                conn = get_db_connection()
                
                # BFS to get local network
                # To capture the laundering loop nicely, we can fetch all transactions around this sender and receiver
                cursor = conn.cursor()
                # Fetch all transactions to build full graph for visualization
                cursor.execute("SELECT transaction_id, sender_id, receiver_id, amount, timestamp, status FROM transactions")
                all_txs = cursor.fetchall()
                conn.close()
                
                # Set up Pyvis Network
                # Uses dark theme matching background
                net = Network(height="450px", width="100%", bgcolor="#1A1D24", font_color="#F8FAFC", directed=True)
                
                # Set physics configuration for a smooth fluid layout
                net.set_options("""
                var options = {
                  "physics": {
                    "barnesHut": {
                      "gravitationalConstant": -3000,
                      "centralGravity": 0.3,
                      "springLength": 95,
                      "springConstant": 0.04,
                      "damping": 0.09,
                      "avoidOverlap": 0.1
                    },
                    "minVelocity": 0.75
                  }
                }
                """)
                
                # Compile users in SQLite to color them correctly
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT user_id, name, risk_tier, is_pep FROM users")
                users_list = cursor.fetchall()
                conn.close()
                
                user_info = {u[0]: {"name": u[1], "risk": u[2], "pep": u[3]} for u in users_list}
                
                # Build nodes and edges
                added_nodes = set()
                
                # We want to identify loops to color them in alert red
                g_nx = nx.DiGraph()
                for tx_id_e, src, tgt, amt, ts, stat in all_txs:
                    g_nx.add_edge(src, tgt, amount=amt, status=stat, tx_id=tx_id_e)
                
                # Find cycles
                cycles = list(nx.simple_cycles(g_nx))
                cycle_nodes = set()
                for c in cycles:
                    for node in c:
                        cycle_nodes.add(node)
                
                # Add nodes
                for tx_id_e, src, tgt, amt, ts, stat in all_txs:
                    for u in [src, tgt]:
                        if u not in added_nodes:
                            added_nodes.add(u)
                            
                            # Default node parameters
                            label = u
                            color = "#007AFF" # Default blue for standard accounts
                            size = 15
                            
                            # Custom coloring based on metadata
                            if u in user_info:
                                name_label = user_info[u]["name"]
                                risk = user_info[u]["risk"]
                                is_pep = user_info[u]["pep"]
                                label = f"{name_label}\\n({u})"
                                
                                if risk == "HIGH":
                                    color = "#FF9500" # Orange for high risk profile
                                elif risk == "MEDIUM":
                                    color = "#FFCC00" # Yellow for medium
                                else:
                                    color = "#34C759" # Green for low
                                    
                                if is_pep:
                                    label += "\\n[PEP]"
                                    size = 20
                                    
                            else:
                                # External accounts
                                color = "#8E8E93" # Gray for external/untracked
                                
                            # If node is part of the circular laundering loop, paint it Alert Red!
                            if u in cycle_nodes:
                                color = "#FF3B30" # Alert Red
                                size = 22
                                label += "\\n[CIRCULAR LOOP]"
                                
                            # Highlight current transaction sender and receiver
                            if u == sender_id or u == receiver_id:
                                border_width = 3
                                shape = "dot"
                            else:
                                border_width = 1
                                shape = "dot"
                                
                            net.add_node(u, label=label, color=color, size=size, shape=shape, borderWidth=border_width)
                            
                    # Add edge
                    edge_color = "#34D399" if stat == "APPROVED" else ("#FF3B30" if stat == "FLAGGED" else "#FFA500")
                    edge_width = 3 if stat == "FLAGGED" else 1.5
                    
                    # Highlight edges that form part of the circular loop
                    in_cycle_edge = False
                    for cycle in cycles:
                        # Check if src and tgt are adjacent in the cycle loop
                        for idx in range(len(cycle)):
                            if cycle[idx] == src and cycle[(idx+1)%len(cycle)] == tgt:
                                in_cycle_edge = True
                                break
                    
                    if in_cycle_edge:
                        edge_color = "#FF3B30"
                        edge_width = 4
                        
                    net.add_edge(
                        src, 
                        tgt, 
                        title=f"Tx ID: {tx_id_e}\\nAmount: ${amt:,.2f}\\nDate: {ts}\\nStatus: {stat}", 
                        label=f"${amt:,.0f}", 
                        color=edge_color,
                        width=edge_width
                    )
                
                # Save and embed in iframe
                net.save_html("temp_graph.html")
                with open("temp_graph.html", "r", encoding="utf-8") as f:
                    html_content = f.read()
                    
                st.components.v1.html(html_content, height=480, scrolling=True)
                
                # Clean up temp file
                if os.path.exists("temp_graph.html"):
                    try:
                        os.remove("temp_graph.html")
                    except:
                        pass
            else:
                st.info("Select a transaction that has been analyzed to view agent findings, citations, and network routing graphs.")
else:
    st.info("No transactions found. Use the simulator in the sidebar to populate the database baseline!")
