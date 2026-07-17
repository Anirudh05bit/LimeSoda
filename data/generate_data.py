import sqlite3
import random
from datetime import datetime, timedelta

def init_db():
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()

    # Create users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        risk_tier TEXT DEFAULT 'LOW',
        avg_amount REAL DEFAULT 100.0,
        std_amount REAL DEFAULT 20.0,
        common_location TEXT DEFAULT 'IN-MUM',
        device_id TEXT,
        is_pep INTEGER DEFAULT 0
    )
    """)

    # Create transactions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        transaction_id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        amount REAL NOT NULL,
        timestamp TEXT NOT NULL,
        location TEXT NOT NULL,
        device_id TEXT NOT NULL,
        status TEXT DEFAULT 'APPROVED' -- APPROVED, FLAGGED, PENDING
    )
    """)

    # Create flagged_transactions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS flagged_transactions (
        transaction_id TEXT PRIMARY KEY,
        risk_score REAL NOT NULL,
        reason TEXT NOT NULL,
        explanation TEXT,
        citations TEXT, -- JSON string of regulations cited
        sar_draft TEXT, -- Suspicious Activity Report template text
        timestamp TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id)
    )
    """)

    conn.commit()
    conn.close()
    print("Database schema initialized successfully.")

def populate_data():
    conn = sqlite3.connect("fraud_sentinel.db")
    cursor = conn.cursor()

    # Clean existing data
    cursor.execute("DELETE FROM flagged_transactions")
    cursor.execute("DELETE FROM transactions")
    cursor.execute("DELETE FROM users")

    # 1. Generate Users
    users_data = [
        ("U1001", "Aarav Mehta", "aarav.mehta@gmail.com", "LOW", 120.0, 30.0, "IN-MUM", "DEV_AA991", 0),
        ("U1002", "Priya Nair", "priya.nair@yahoo.com", "LOW", 75.0, 15.0, "IN-BLR", "DEV_PN442", 0),
        ("U1003", "Amit Patel", "amit.patel@hotmail.com", "LOW", 250.0, 60.0, "IN-ADI", "DEV_AP301", 0),
        ("U1004", "Rajesh Kumar", "rajesh.kumar@outlook.com", "MEDIUM", 80.0, 20.0, "IN-MUM", "DEV_RK888", 0), # Will be targeted by velocity/geo attack
        ("U1005", "Vikram Singh", "vikram.pep@govt.in", "HIGH", 1500.0, 500.0, "IN-DEL", "DEV_VS007", 1), # PEP (Politically Exposed Person)
        ("U1006", "Sneha Rao", "sneha.rao@gmail.com", "LOW", 45.0, 10.0, "IN-HYD", "DEV_SR221", 0),
        ("U1007", "John Doe", "john.doe@gmail.com", "LOW", 300.0, 80.0, "US-NYC", "DEV_JD551", 0),
        ("U1008", "Sarah Jenkins", "sarah.j@finance.co.uk", "MEDIUM", 450.0, 120.0, "UK-LON", "DEV_SJ777", 0),
        ("U1009", "Sunita Sharma", "sunita.sharma@gmail.com", "HIGH", 50.0, 15.0, "IN-DEL", "DEV_SS233", 0), # Will run structuring scenario
        ("U1010", "Rohan Verma", "rohan.v@rediffmail.com", "LOW", 110.0, 25.0, "IN-PNQ", "DEV_RV902", 0),
        
        # Money Laundering Loop Users (Pig Butchering scenario)
        ("U1015", "Arthur Dent (Victim)", "arthur.dent@earth.com", "LOW", 150.0, 40.0, "US-NYC", "DEV_AD42", 0),
        ("U1020", "Broker Ltd (Shell A)", "broker.ltd@shellco.com", "HIGH", 10000.0, 8000.0, "KY-GEO", "DEV_SHELL_A", 0), # Cayman Islands
        ("U1021", "Laundering Layer B1", "layer.b1@shellco.com", "HIGH", 5000.0, 4000.0, "PA-PTY", "DEV_SHELL_B1", 0), # Panama
        ("U1022", "Laundering Layer B2", "layer.b2@shellco.com", "HIGH", 5000.0, 4000.0, "CY-NIC", "DEV_SHELL_B2", 0), # Cyprus
        ("U1023", "Laundering Layer C1", "layer.c1@shellco.com", "HIGH", 5000.0, 4000.0, "HK-HKG", "DEV_SHELL_C1", 0), # Hong Kong
        ("U1024", "Laundering Layer C2", "layer.c2@shellco.com", "HIGH", 5000.0, 4000.0, "SG-SGP", "DEV_SHELL_C2", 0), # Singapore
        ("U1025", "Consolidator D", "consolidator.d@shellco.com", "HIGH", 10000.0, 8000.0, "IN-MUM", "DEV_SHELL_D", 0),
    ]

    cursor.executemany("""
    INSERT INTO users (user_id, name, email, risk_tier, avg_amount, std_amount, common_location, device_id, is_pep)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, users_data)

    # 2. Generate Historical Transactions (Normal behavior for baseline statistics)
    # Generate ~30-40 transactions per normal user over the past 30 days
    base_time = datetime.now() - timedelta(days=30)
    tx_id_counter = 10000

    for user in users_data[:10]: # Standard users
        user_id, name, _, _, avg_amt, std_amt, common_loc, device_id, _ = user
        for i in range(40):
            tx_id_counter += 1
            amount = round(max(5.0, random.normalvariate(avg_amt, std_amt)), 2)
            time_delta = timedelta(days=random.randint(0, 29), hours=random.randint(0, 23), minutes=random.randint(0, 59))
            tx_time = (base_time + time_delta).isoformat()
            
            # 95% chance of common location, 5% chance of alternative
            location = common_loc if random.random() < 0.95 else random.choice(["IN-DEL", "IN-BLR", "IN-MUM", "IN-MAA"])
            # 98% chance of usual device
            dev = device_id if random.random() < 0.98 else f"DEV_ALT_{random.randint(100,999)}"
            
            cursor.execute("""
            INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED')
            """, (f"TX{tx_id_counter}", user_id, "MERCHANT_GENERIC", amount, tx_time, location, dev))

    # 3. Insert Attack/Scenario Transactions (These will be analyzed during the live run)
    current_time = datetime.now()

    # Scenario B: Velocity & Impossible Travel (Rajesh Kumar U1004)
    # Normally spends ~$80 in Mumbai.
    # Tx 1: Mumbai, normal device, APPROVED (1 hour ago)
    t1 = (current_time - timedelta(hours=1)).isoformat()
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED')
    """, ("TX2001", "U1004", "MERCHANT_DOMESTIC", 85.00, t1, "IN-MUM", "DEV_RK888"))

    # Tx 2: Russia (impossible travel, 5 mins later) - PENDING
    t2 = (current_time - timedelta(minutes=55)).isoformat()
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX2002", "U1004", "ACC_EXT_RU_BAD", 950.00, t2, "RU-MOW", "DEV_HACKER_X"))

    # Tx 3: Russia (high velocity, 2 mins after Tx 2) - PENDING
    t3 = (current_time - timedelta(minutes=53)).isoformat()
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX2003", "U1004", "ACC_EXT_RU_BAD2", 1500.00, t3, "RU-MOW", "DEV_HACKER_X"))


    # Scenario C: Structuring / Smurfing (Sunita Sharma U1009)
    # Sunita tries to send multiple amounts just under the $10,000 reportable threshold to external account.
    for i, amt in enumerate([9900.00, 9850.00, 9950.00]):
        tx_time = (current_time - timedelta(minutes=30 - (i * 3))).isoformat()
        tx_id = f"TX300{i+1}"
        cursor.execute("""
        INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
        """, (tx_id, "U1009", "ACC_EXT_LAUND_881", amt, tx_time, "IN-DEL", "DEV_SS233"))


    # Scenario D: Pig-Butchering / Money Laundering Graph Layering
    # Victim Arthur Dent U1015 transfers $50,000 to Broker Ltd (Shell A) U1020.
    # U1020 splits and routes it down the layers to conceal the origin.
    # Flow: 
    # U1015 (Arthur) -> $50,000 -> U1020 (Shell A)
    # U1020 -> $25,000 each -> U1021 (Layer B1) & U1022 (Layer B2)
    # U1021 -> $25,000 -> U1023 (Layer C1)
    # U1022 -> $25,000 -> U1024 (Layer C2)
    # U1023 & U1024 -> $25,000 each -> U1025 (Consolidator D)
    # U1025 -> $50,000 -> U1020 (Shell A) - Loop completed!
    
    ml_time = current_time - timedelta(minutes=45)
    
    # Victim Deposit (APPROVED or PENDING check)
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX4001", "U1015", "U1020", 50000.00, ml_time.isoformat(), "US-NYC", "DEV_AD42"))
    
    # Layer 1 Splits
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX4002", "U1020", "U1021", 25000.00, (ml_time + timedelta(minutes=5)).isoformat(), "KY-GEO", "DEV_SHELL_A"))
    
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX4003", "U1020", "U1022", 25000.00, (ml_time + timedelta(minutes=6)).isoformat(), "PA-PTY", "DEV_SHELL_A"))
    
    # Layer 2 Route
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX4004", "U1021", "U1023", 25000.00, (ml_time + timedelta(minutes=10)).isoformat(), "PA-PTY", "DEV_SHELL_B1"))
    
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX4005", "U1022", "U1024", 25000.00, (ml_time + timedelta(minutes=11)).isoformat(), "CY-NIC", "DEV_SHELL_B2"))

    # Layer 3 Consolidation
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX4006", "U1023", "U1025", 25000.00, (ml_time + timedelta(minutes=15)).isoformat(), "HK-HKG", "DEV_SHELL_C1"))
    
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX4007", "U1024", "U1025", 25000.00, (ml_time + timedelta(minutes=16)).isoformat(), "SG-SGP", "DEV_SHELL_C2"))
    
    # Cash-out back to Shell A (Circular loop)
    cursor.execute("""
    INSERT INTO transactions (transaction_id, sender_id, receiver_id, amount, timestamp, location, device_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    """, ("TX4008", "U1025", "U1020", 50000.00, (ml_time + timedelta(minutes=20)).isoformat(), "IN-MUM", "DEV_SHELL_D"))

    conn.commit()
    conn.close()
    print("Database populated with normal baselines and attack scenarios.")

if __name__ == "__main__":
    init_db()
    populate_data()
