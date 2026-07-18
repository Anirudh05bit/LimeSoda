import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'tracelens.db');

export function runSeed() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ------------------------------------------------------------------
  // 1. Apply schema
  // ------------------------------------------------------------------
  const schemaPath = join(__dirname, 'tracelens-schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Guard: skip if already seeded
  const existing = db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number };
  if (existing.n > 0) {
    console.log('[seed] Database already seeded — skipping.');
    db.close();
    return;
  }

  const insertCustomer = db.prepare(
    `INSERT INTO customers (customer_code, name, email, risk_rating, status)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertAccount = db.prepare(
    `INSERT INTO accounts (account_number, customer_id, account_type, balance, status)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertDevice = db.prepare(
    `INSERT INTO devices (device_id, device_type, os, last_seen_at)
     VALUES (?, ?, ?, datetime('now'))`
  );
  const linkDeviceAccount = db.prepare(
    `INSERT INTO device_accounts (device_id, account_id) VALUES (?, ?)`
  );
  const insertTransaction = db.prepare(
    `INSERT INTO transactions (transaction_id, from_account_id, to_account_id, amount, currency, status, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  );
  const insertAlert = db.prepare(
    `INSERT INTO alerts (alert_id, customer_id, alert_type, severity, status, description)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  // ------------------------------------------------------------------
  // 2. Seed inside a transaction for atomicity
  // ------------------------------------------------------------------
  const seed = db.transaction(() => {
    // --- Customer ---
    insertCustomer.run('CUST-001', 'Acme Corp', 'acme@example.com', 'high', 'active');
    const customerRow = db.prepare('SELECT id FROM customers WHERE customer_code = ?').get('CUST-001') as { id: number };
    const customerId = customerRow.id;

    // --- Accounts (4 linked to CUST-001) ---
    insertAccount.run('ACC-A001', customerId, 'checking', 125000.00, 'active');
    insertAccount.run('ACC-B002', customerId, 'business',  84000.00, 'active');
    insertAccount.run('ACC-C003', customerId, 'savings',   53000.00, 'active');
    insertAccount.run('ACC-D004', customerId, 'checking',  31000.00, 'active');

    const accounts = db.prepare(
      'SELECT id, account_number FROM accounts WHERE customer_id = ? ORDER BY account_number'
    ).all(customerId) as { id: number; account_number: string }[];

    const acctMap = new Map(accounts.map(a => [a.account_number, a.id]));

    // --- Shared device across all 4 accounts ---
    insertDevice.run('DEV-SHARED-001', 'mobile', 'iOS 18');
    const deviceRow = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-SHARED-001') as { id: number };
    const deviceId = deviceRow.id;

    for (const acctId of acctMap.values()) {
      linkDeviceAccount.run(deviceId, acctId);
    }

    // --- Circular transaction chain: A -> B -> C -> A ---
    const acctA = acctMap.get('ACC-A001')!;
    const acctB = acctMap.get('ACC-B002')!;
    const acctC = acctMap.get('ACC-C003')!;

    insertTransaction.run('TXN-001', acctA, acctB, 15000.00, 'USD', 'completed');
    insertTransaction.run('TXN-002', acctB, acctC, 15000.00, 'USD', 'completed');
    insertTransaction.run('TXN-003', acctC, acctA, 15000.00, 'USD', 'completed');

    // --- Alert: fund_dispersal, high severity ---
    insertAlert.run(
      'ALT-001',
      customerId,
      'fund_dispersal',
      'high',
      'open',
      'Circular fund movement detected across ACC-A001 → ACC-B002 → ACC-C003 → ACC-A001 within 24 hours'
    );
  });

  seed();
  console.log('[seed] TraceLens seed data inserted successfully.');
  db.close();
}

// Allow direct execution: ts-node src/database/tracelens-seed.ts
runSeed();
