import sys
import os
import sqlite3
import json
import math
from datetime import datetime, timedelta
import networkx as nx

# Add workspace directory to path to import regulations RAG
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from rag.regulations_rag import RegulationsRAG

from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("Fraud Sentinel Server")

COORDINATES = {
    "IN-MUM": (19.0760, 72.8777),
    "IN-DEL": (28.7041, 77.1025),
    "IN-BLR": (12.9716, 77.5946),
    "IN-HYD": (17.3850, 78.4867),
    "IN-ADI": (23.0225, 72.5714),
    "IN-PNQ": (18.5204, 73.8567),
    "IN-MAA": (13.0827, 80.2707),
    "US-NYC": (40.7128, -74.0060),
    "UK-LON": (51.5074, -0.1278),
    "RU-MOW": (55.7558, 37.6173),
    "KY-GEO": (19.2866, -81.3680),
    "PA-PTY": (8.9824, -79.5199),
    "CY-NIC": (35.1856, 33.3823),
    "HK-HKG": (22.3193, 114.1694),
    "SG-SGP": (1.3521, 103.8198),
}

def haversine_distance(loc1: str, loc2: str) -> float:
    if loc1 not in COORDINATES or loc2 not in COORDINATES:
        return 0.0
    lat1, lon1 = COORDINATES[loc1]
    lat2, lon2 = COORDINATES[loc2]
    r = 6371.0 # Earth's radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c

@mcp.tool()
def get_transaction(transaction_id: str) -> str:
    """Fetch details of a single transaction by its ID."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT t.transaction_id, t.sender_id, t.receiver_id, t.amount, t.timestamp, t.location, t.device_id, t.status,
                   u.name as sender_name, u.risk_tier as sender_risk
            FROM transactions t
            LEFT JOIN users u ON t.sender_id = u.user_id
            WHERE t.transaction_id = ?
        """, (transaction_id,))
        row = cursor.fetchone()
        if not row:
            return json.dumps({"error": f"Transaction {transaction_id} not found."})
            
        tx_data = {
            "transaction_id": row[0],
            "sender_id": row[1],
            "sender_name": row[8],
            "sender_risk_tier": row[9],
            "receiver_id": row[2],
            "amount": row[3],
            "timestamp": row[4],
            "location": row[5],
            "device_id": row[6],
            "status": row[7]
        }
        return json.dumps(tx_data, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        conn.close()

@mcp.tool()
def get_user_history(user_id: str) -> str:
    """Fetch historical baseline profile and stats of a user."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT user_id, name, email, risk_tier, avg_amount, std_amount, common_location, device_id, is_pep
            FROM users WHERE user_id = ?
        """, (user_id,))
        row = cursor.fetchone()
        if not row:
            # If user is not in DB, they could be an external entity
            cursor.execute("SELECT COUNT(*) FROM transactions WHERE sender_id = ? OR receiver_id = ?", (user_id, user_id))
            cnt = cursor.fetchone()[0]
            if cnt > 0:
                return json.dumps({
                    "user_id": user_id,
                    "name": "External Account",
                    "risk_tier": "UNKNOWN / EXTERNAL",
                    "avg_amount": 0.0,
                    "std_amount": 0.0,
                    "common_location": "UNKNOWN",
                    "device_id": "UNKNOWN",
                    "is_pep": 0,
                    "total_transactions": cnt
                }, indent=2)
            return json.dumps({"error": f"User {user_id} not found."})
            
        user_data = {
            "user_id": row[0],
            "name": row[1],
            "email": row[2],
            "risk_tier": row[3],
            "avg_amount": row[4],
            "std_amount": row[5],
            "common_location": row[6],
            "device_id": row[7],
            "is_pep": bool(row[8])
        }
        
        # Add summary transaction metrics
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE sender_id = ? AND status = 'APPROVED'", (user_id,))
        user_data["approved_count"] = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM transactions WHERE sender_id = ? AND status = 'FLAGGED'", (user_id,))
        user_data["flagged_count"] = cursor.fetchone()[0]
        
        return json.dumps(user_data, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        conn.close()

@mcp.tool()
def check_velocity(user_id: str, current_tx_timestamp: str, window_mins: int = 60) -> str:
    """Check transaction frequency (velocity) and cumulative amount for a user in the window_mins preceding current_tx_timestamp."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    try:
        t_current = datetime.fromisoformat(current_tx_timestamp)
        t_start = t_current - timedelta(minutes=window_mins)
        
        cursor.execute("""
            SELECT transaction_id, amount, timestamp, location, status
            FROM transactions
            WHERE sender_id = ? AND timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp DESC
        """, (user_id, t_start.isoformat(), current_tx_timestamp))
        rows = cursor.fetchall()
        
        txs = [{
            "transaction_id": r[0],
            "amount": r[1],
            "timestamp": r[2],
            "location": r[3],
            "status": r[4]
        } for r in rows]
        
        total_amount = sum(tx["amount"] for tx in txs)
        count = len(txs)
        
        return json.dumps({
            "user_id": user_id,
            "window_mins": window_mins,
            "count": count,
            "total_amount": total_amount,
            "transactions": txs
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        conn.close()

@mcp.tool()
def check_geo_anomaly(user_id: str, current_tx_timestamp: str, current_location: str) -> str:
    """Check for impossible travel speed (geo anomaly) comparing the current transaction's location/time to the preceding one."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    try:
        # Find the immediately preceding transaction for this user
        cursor.execute("""
            SELECT transaction_id, location, timestamp, amount
            FROM transactions
            WHERE sender_id = ? AND timestamp < ?
            ORDER BY timestamp DESC LIMIT 1
        """, (user_id, current_tx_timestamp))
        row = cursor.fetchone()
        if not row:
            return json.dumps({
                "geo_anomaly": False,
                "message": "No preceding transactions found to establish travel velocity."
            })
            
        prev_id, prev_loc, prev_time_str, prev_amount = row
        t_current = datetime.fromisoformat(current_tx_timestamp)
        t_prev = datetime.fromisoformat(prev_time_str)
        
        time_diff_hours = (t_current - t_prev).total_seconds() / 3600.0
        # Guard against division by zero
        if time_diff_hours <= 0:
            time_diff_hours = 0.001
            
        dist_km = haversine_distance(prev_loc, current_location)
        required_speed_kph = dist_km / time_diff_hours
        
        # Define anomaly: speed > 800 km/h (typical airliner speed)
        is_anomaly = required_speed_kph > 800.0 and dist_km > 50.0
        
        return json.dumps({
            "geo_anomaly": is_anomaly,
            "distance_km": round(dist_km, 2),
            "time_difference_hours": round(time_diff_hours, 4),
            "required_speed_kph": round(required_speed_kph, 2),
            "prev_transaction": {
                "transaction_id": prev_id,
                "location": prev_loc,
                "timestamp": prev_time_str,
                "amount": prev_amount
            },
            "current_location": current_location,
            "current_timestamp": current_tx_timestamp
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        conn.close()

@mcp.tool()
def check_amount_anomaly(user_id: str, amount: float) -> str:
    """Calculate Z-score statistic of a transaction amount against the user's historical spend baseline."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT avg_amount, std_amount FROM users WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            return json.dumps({
                "amount_anomaly": False,
                "message": f"User {user_id} not found. Baseline is unavailable."
            })
            
        avg_amt, std_amt = row
        if std_amt == 0:
            std_amt = 10.0 # Prevent division by zero
            
        z_score = (amount - avg_amt) / std_amt
        is_anomaly = z_score > 3.0 # Standard normal distribution outlier
        
        return json.dumps({
            "amount_anomaly": is_anomaly,
            "z_score": round(z_score, 4),
            "avg_historical_amount": avg_amt,
            "std_deviation": std_amt,
            "current_amount": amount
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        conn.close()

@mcp.tool()
def search_regulation(query: str) -> str:
    """RAG tool to search RBI, SEBI, FATF, and FinCEN regulation excerpts matching keywords."""
    try:
        results = RegulationsRAG.search(query, top_n=3)
        return json.dumps(results, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})

@mcp.tool()
def flag_transaction(transaction_id: str, risk_score: float, reason: str, explanation: str, citations_json: str) -> str:
    """Flag a transaction in the database, writing risk score, reasons, and citations."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    current_time = datetime.now().isoformat()
    try:
        # Check if transaction exists
        cursor.execute("SELECT transaction_id FROM transactions WHERE transaction_id = ?", (transaction_id,))
        if not cursor.fetchone():
            return json.dumps({"error": f"Transaction {transaction_id} does not exist."})
            
        # Update transaction status
        status = "FLAGGED" if risk_score >= 50 else "APPROVED"
        cursor.execute("UPDATE transactions SET status = ? WHERE transaction_id = ?", (status, transaction_id))
        
        # Insert or replace in flagged_transactions
        cursor.execute("""
            INSERT OR REPLACE INTO flagged_transactions (transaction_id, risk_score, reason, explanation, citations, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (transaction_id, risk_score, reason, explanation, citations_json, current_time))
        
        conn.commit()
        return json.dumps({
            "status": "success",
            "transaction_id": transaction_id,
            "risk_score": risk_score,
            "action_taken": f"Transaction status updated to {status}."
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        conn.close()

@mcp.tool()
def notify_alert(message: str) -> str:
    """Trigger real-time alert logs and dispatch webhook payloads (e.g. simulated Slack alerts)."""
    # In a real environment, we'd request slack webhook from env and post.
    # We will log the message, and try to post if environment webhook exists.
    webhook_url = os.environ.get("SLACK_WEBHOOK_URL", "")
    print(f"[ALERT NOTIFICATION]: {message}")
    
    status_msg = "Alert printed to server logs."
    if webhook_url:
        import urllib.request
        try:
            req = urllib.request.Request(
                webhook_url,
                data=json.dumps({"text": message}).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req) as response:
                status_msg += f" Dispatched to Slack (Response: {response.status})."
        except Exception as e:
            status_msg += f" Failed to dispatch to Slack: {str(e)}"
            
    return json.dumps({"status": "delivered", "log": status_msg})

@mcp.tool()
def get_transaction_graph(start_user_id: str, depth: int = 4) -> str:
    """Build a network graph of transfers linked to start_user_id up to depth hops (useful to visualize flows)."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    try:
        queue = [(start_user_id, 0)]
        visited_users = {start_user_id}
        nodes = {start_user_id: {"id": start_user_id, "label": start_user_id}}
        edges = []
        
        cursor.execute("SELECT name, risk_tier FROM users WHERE user_id = ?", (start_user_id,))
        row = cursor.fetchone()
        if row:
            nodes[start_user_id]["label"] = f"{row[0]} ({start_user_id})"
            nodes[start_user_id]["risk_tier"] = row[1]
            
        while queue:
            curr_user, curr_depth = queue.pop(0)
            if curr_depth >= depth:
                continue
                
            cursor.execute("""
                SELECT transaction_id, sender_id, receiver_id, amount, timestamp, status
                FROM transactions
                WHERE sender_id = ?
            """, (curr_user,))
            out_txs = cursor.fetchall()
            
            cursor.execute("""
                SELECT transaction_id, sender_id, receiver_id, amount, timestamp, status
                FROM transactions
                WHERE receiver_id = ?
            """, (curr_user,))
            in_txs = cursor.fetchall()
            
            for tx_id, sender, receiver, amount, timestamp, status in out_txs + in_txs:
                edge_id = f"{sender}_{receiver}_{tx_id}"
                if any(e["id"] == edge_id for e in edges):
                    continue
                    
                edges.append({
                    "id": edge_id,
                    "source": sender,
                    "target": receiver,
                    "amount": amount,
                    "timestamp": timestamp,
                    "status": status,
                    "label": f"${amount:,.2f}"
                })
                
                for u in [sender, receiver]:
                    if u not in nodes:
                        nodes[u] = {"id": u, "label": u}
                        cursor.execute("SELECT name, risk_tier FROM users WHERE user_id = ?", (u,))
                        u_row = cursor.fetchone()
                        if u_row:
                            nodes[u]["label"] = f"{u_row[0]} ({u})"
                            nodes[u]["risk_tier"] = u_row[1]
                        else:
                            nodes[u]["label"] = u
                            nodes[u]["risk_tier"] = "EXTERNAL"
                            
                counterparty = receiver if curr_user == sender else sender
                if counterparty not in visited_users:
                    visited_users.add(counterparty)
                    queue.append((counterparty, curr_depth + 1))
                    
        return json.dumps({"nodes": list(nodes.values()), "edges": edges}, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        conn.close()

@mcp.tool()
def detect_circular_transfers(start_user_id: str, depth: int = 4) -> str:
    """Use graph analytics (NetworkX) to detect if start_user_id is part of a circular laundering/structuring loop."""
    # Build graph starting from start_user_id
    graph_data_str = get_transaction_graph(start_user_id, depth)
    graph_data = json.loads(graph_data_str)
    
    if "error" in graph_data:
        return graph_data_str
        
    # Build NetworkX Directed Graph
    g = nx.DiGraph()
    for node in graph_data["nodes"]:
        g.add_node(node["id"], **node)
    for edge in graph_data["edges"]:
        # Add edge, aggregate values if there are multiple transactions between same nodes
        src = edge["source"]
        tgt = edge["target"]
        amt = edge["amount"]
        if g.has_edge(src, tgt):
            g[src][tgt]["amount"] += amt
            g[src][tgt]["txs"].append(edge)
        else:
            g.add_edge(src, tgt, amount=amt, txs=[edge])
            
    # Find cycles
    cycles = list(nx.simple_cycles(g))
    
    # Filter cycles that contain the user (or any cycles found at all)
    user_cycles = [c for c in cycles if start_user_id in c]
    
    # Format response
    has_loop = len(cycles) > 0
    return json.dumps({
        "circular_loop_detected": has_loop,
        "total_cycles_found": len(cycles),
        "user_cycles": user_cycles,
        "all_cycles": cycles,
        "message": f"Found {len(cycles)} circular transaction path(s)." if has_loop else "No circular transaction loops detected."
    }, indent=2)

@mcp.tool()
def draft_sar_report(transaction_id: str, agent_notes: str) -> str:
    """Generate a template Suspicious Activity Report (SAR) compliance draft based on transaction findings."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    try:
        # Fetch transaction + sender + flag info if available
        cursor.execute("""
            SELECT t.transaction_id, t.sender_id, t.receiver_id, t.amount, t.timestamp, t.location, t.device_id,
                   u.name, u.email, u.risk_tier, u.is_pep,
                   f.risk_score, f.reason, f.explanation, f.citations
            FROM transactions t
            LEFT JOIN users u ON t.sender_id = u.user_id
            LEFT JOIN flagged_transactions f ON t.transaction_id = f.transaction_id
            WHERE t.transaction_id = ?
        """, (transaction_id,))
        row = cursor.fetchone()
        if not row:
            return json.dumps({"error": f"Transaction {transaction_id} not found."})
            
        (tx_id, sender_id, rx_id, amount, ts, loc, dev,
         s_name, s_email, s_risk, s_pep,
         risk_score, reason, explanation, citations) = row
         
        # Draft Report Text
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        report = f"""================================================================================
SUSPICIOUS ACTIVITY REPORT (SAR) DRAFT - INTERNAL COMPLIANCE ONLY
Generated: {now_str}
================================================================================

1. REPORTING ENTITY DETAILS
---------------------------
Entity Name: Fraud Sentinel compliance agent
System ID  : FS-AGENT-CLAUDE

2. SUSPICIOUS TRANSACTION SUMMARY
---------------------------------
Transaction ID   : {tx_id}
Transaction Date : {ts}
Amount           : ${amount:,.2f}
Location/Branch  : {loc}
Originating IP/Dev: {dev}
Status           : FLAGGED (Risk Score: {risk_score if risk_score else 'UNSPECIFIED'})

3. SUBJECT DETAILS (SENDER)
---------------------------
Subject ID       : {sender_id}
Full Name        : {s_name if s_name else 'Unknown'}
Email Address    : {s_email if s_email else 'N/A'}
Historical Risk  : {s_risk if s_risk else 'N/A'}
PEP Status       : {'YES (Politically Exposed Person)' if s_pep else 'NO'}
Beneficiary ID   : {rx_id}

4. NARRATIVE & REASON FOR FILING
--------------------------------
Summary Reason   : {reason if reason else 'Suspicious transaction pattern flagged by risk rules.'}
Detailed Analysis:
{explanation if explanation else 'No explanation provided.'}

Additional Investigation Notes:
{agent_notes}

5. REGULATORY EXCERPTS CITED
----------------------------
Citations:
{citations if citations else 'None.'}

================================================================================
END OF REPORT
================================================================================
"""
        # Save SAR report to database
        cursor.execute("UPDATE flagged_transactions SET sar_draft = ? WHERE transaction_id = ?", (report, transaction_id))
        conn.commit()
        
        return json.dumps({
            "status": "success",
            "transaction_id": transaction_id,
            "sar_draft": report
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
    finally:
        conn.close()

if __name__ == "__main__":
    # Start the server (FastMCP handles stdin/stdout server launch automatically)
    mcp.run()
