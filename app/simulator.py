import sqlite3
import random
from datetime import datetime, timedelta
import os
import sys

# Ensure parent directory is in path to import generator
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from data.generate_data import init_db, populate_data

def reset_database():
    """Wipe database and re-generate clean baseline and pending transactions."""
    init_db()
    populate_data()
    print("Database reset successfully.")

def generate_random_transaction():
    """Generate a single random normal customer purchase transaction."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    
    try:
        # Pick a random normal user
        cursor.execute("""
            SELECT user_id, avg_amount, std_amount, common_location, device_id 
            FROM users 
            WHERE risk_tier IN ('LOW', 'MEDIUM') AND is_pep = 0
            ORDER BY RANDOM() LIMIT 1
        """)
        user = cursor.fetchone()
        if not user:
            return None
            
        user_id, avg_amt, std_amt, common_loc, device_id = user
        
        # Calculate normal amount
        amount = round(max(5.0, random.normalvariate(avg_amt, std_amt)), 2)
        timestamp = datetime.now().isoformat()
        
        # Location setup
        location = common_loc
        if random.random() > 0.95:
            # 5% chance to shop elsewhere domestically
            domestic_locations = ["IN-MUM", "IN-DEL", "IN-BLR", "IN-HYD", "IN-ADI", "IN-PNQ", "IN-MAA"]
            location = random.choice([l for l in domestic_locations if l != common_loc])
            
        # Device details
        device = device_id
        if random.random() > 0.98:
            device = f"DEV_ALT_{random.randint(100, 999)}"
            
        # Random merchant list
        merchants = [
            "MERCH_AMAZON_IN", "MERCH_UBER_PAY", "MERCH_NETFLIX_DIGITAL", 
            "MERCH_STARBUCKS", "MERCH_ZOMATO_DELIVERY", "MERCH_SWIGGY_FOOD", 
            "MERCH_SHELL_OIL", "MERCH_WALMART_RET", "MERCH_APPLE_STORE"
        ]
        receiver_id = random.choice(merchants)
        
        # Generate new ID
        cursor.execute("SELECT COUNT(*) FROM transactions")
        tx_count = cursor.fetchone()[0]
        tx_id = f"TX{10000 + tx_count + random.randint(1, 9)}"
        
        cursor.execute("""
            INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED')
        """, (tx_id, user_id, receiver_id, amount, timestamp, location, device))
        
        conn.commit()
        return {
            "transaction_id": tx_id,
            "sender_id": user_id,
            "receiver_id": receiver_id,
            "amount": amount,
            "timestamp": timestamp,
            "location": location,
            "device_id": device,
            "status": "APPROVED"
        }
    except Exception as e:
        print(f"Error generating random transaction: {e}")
        return None
    finally:
        conn.close()

def inject_velocity_anomaly():
    """Inject a sequence of speed-run velocity anomaly transactions for Rajesh Kumar (U1004)."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    
    try:
        user_id = "U1004"
        now = datetime.now()
        injected_ids = []
        
        # Transaction 1: Russia (Impossible speed flight from Mumbai, 2 mins delta)
        tx_id1 = f"TX_VEL_{random.randint(100, 999)}"
        t1 = (now - timedelta(seconds=30)).isoformat()
        cursor.execute("""
            INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
        """, (tx_id1, user_id, "ACC_EXT_RU_LAUNDER", 1200.00, t1, "RU-MOW", "DEV_HACKER_X"))
        injected_ids.append(tx_id1)
        
        # Transaction 2: Russia (Speed velocity execution, 1 min later)
        tx_id2 = f"TX_VEL_{random.randint(1000, 9999)}"
        t2 = now.isoformat()
        cursor.execute("""
            INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
        """, (tx_id2, user_id, "ACC_EXT_RU_LAUNDER2", 2300.00, t2, "RU-MOW", "DEV_HACKER_X"))
        injected_ids.append(tx_id2)
        
        conn.commit()
        return injected_ids
    except Exception as e:
        print(f"Error injecting velocity anomaly: {e}")
        return []
    finally:
        conn.close()

def inject_structuring_anomaly():
    """Inject transactions breaking up a large sum into items just under $10,000 (Sunita Sharma U1009)."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    
    try:
        user_id = "U1009"
        now = datetime.now()
        injected_ids = []
        
        # Insert 3 transactions in rapid succession, all just below $10,000 threshold
        amounts = [9850.00, 9910.00, 9890.00]
        for i, amt in enumerate(amounts):
            tx_id = f"TX_STR_{random.randint(1000, 9999)}"
            t = (now + timedelta(seconds=i*5)).isoformat()
            cursor.execute("""
                INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
            """, (tx_id, user_id, "ACC_EXT_SMURF_RECEIVE", amt, t, "IN-DEL", "DEV_SS233"))
            injected_ids.append(tx_id)
            
        conn.commit()
        return injected_ids
    except Exception as e:
        print(f"Error injecting structuring anomaly: {e}")
        return []
    finally:
        conn.close()

def inject_laundering_loop():
    """Inject a high-volume pig-butchering money laundering cycle linking U1015 (victim) to U1020-U1025 loop."""
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()
    
    try:
        now = datetime.now()
        injected_ids = []
        
        # Transaction flow linking Victim U1015 to Broker Ltd U1020 to Panama, Cyprus, Singapore, Mumbai consolidation
        flow = [
            ("U1015", "U1020", 85000.00, "US-NYC", "DEV_AD42", 0),  # Victim deposit
            ("U1020", "U1021", 42500.00, "KY-GEO", "DEV_SHELL_A", 1), # Split 1
            ("U1020", "U1022", 42500.00, "KY-GEO", "DEV_SHELL_A", 2), # Split 2
            ("U1021", "U1023", 42500.00, "PA-PTY", "DEV_SHELL_B1", 3), # Routing layer
            ("U1022", "U1024", 42500.00, "CY-NIC", "DEV_SHELL_B2", 4), # Routing layer
            ("U1023", "U1025", 42500.00, "HK-HKG", "DEV_SHELL_C1", 5), # Consolidation 1
            ("U1024", "U1025", 42500.00, "SG-SGP", "DEV_SHELL_C2", 6), # Consolidation 2
            ("U1025", "U1020", 85000.00, "IN-MUM", "DEV_SHELL_D", 7)   # Cashback loop
        ]
        
        for sender, receiver, amount, location, device, offset in flow:
            tx_id = f"TX_PIG_{random.randint(100, 999)}_{offset}"
            t = (now + timedelta(seconds=offset*2)).isoformat()
            cursor.execute("""
                INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
            """, (tx_id, sender, receiver, amount, t, location, device))
            injected_ids.append(tx_id)
            
        conn.commit()
        return injected_ids
    except Exception as e:
        print(f"Error injecting laundering loop: {e}")
        return []
    finally:
        conn.close()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "reset":
        reset_database()
    else:
        print("Simulator loaded. Run 'python simulator.py reset' to reset DB.")
