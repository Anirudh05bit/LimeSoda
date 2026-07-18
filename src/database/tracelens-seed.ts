import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_PATH } from './db-path.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function extractKeywords(text: string): string {
  const stopWords = new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','shall','should','may','might','can','could',
    'to','of','in','for','on','with','at','by','from','as','into','through','during',
    'before','after','above','below','between','under','again','further','then','once',
    'here','there','when','where','why','how','all','both','each','few','more','most',
    'other','some','such','no','nor','not','only','own','same','so','than','too','very',
    'just','because','but','and','or','if','while','about','against','it','its','this',
    'that','these','those','i','me','my','we','our','you','your','he','him','his','she',
    'her','they','them','their','what','which','who','whom'
  ]);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  const freq = new Map<string, number>();
  for (const word of words) {
    if (word.length < 3 || stopWords.has(word)) continue;
    freq.set(word, (freq.get(word) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word)
    .join(',');
}

export function runSeed() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = join(__dirname, 'tracelens-schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  const existing = db.prepare('SELECT COUNT(*) AS n FROM customers').get() as { n: number };
  if (existing.n > 0) {
    console.log('[seed] Database already seeded — skipping.');
    db.close();
    return;
  }

  // ── Prepared statements ──────────────────────────────────────
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
    `INSERT INTO transactions (transaction_id, from_account_id, to_account_id, amount, currency, status, initiated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`
  );
  const insertAlert = db.prepare(
    `INSERT INTO alerts (alert_id, customer_id, alert_type, severity, status, description, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))`
  );
  const insertCase = db.prepare(
    `INSERT INTO cases (case_id, alert_id, customer_id, title, status, priority, assigned_to)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAuditLog = db.prepare(
    `INSERT INTO audit_log (tool_name, input_json, output_json, actor_subject, actor_role, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`
  );

  // RAG statements
  const insertDocument = db.prepare(
    `INSERT INTO documents (doc_id, title, doc_type, source, content) VALUES (?, ?, ?, ?, ?)`
  );
  const insertChunk = db.prepare(
    `INSERT INTO document_chunks (document_id, chunk_index, content, keywords) VALUES (?, ?, ?, ?)`
  );

  // KG statements
  const insertEntity = db.prepare(
    `INSERT INTO kg_entities (entity_id, entity_type, name, attributes, risk_score) VALUES (?, ?, ?, ?, ?)`
  );
  const insertRelationship = db.prepare(
    `INSERT INTO kg_relationships (source_entity_id, target_entity_id, relationship_type, weight, attributes) VALUES (?, ?, ?, ?, ?)`
  );

  // Helper to get account ID by number
  const getAccountId = (num: string) => {
    const row = db.prepare('SELECT id FROM accounts WHERE account_number = ?').get(num) as { id: number };
    return row.id;
  };

  const seed = db.transaction(() => {

    // ════════════════════════════════════════════════════════════
    // SCENARIO 1: Acme Corp — Mule account / circular layering
    // ════════════════════════════════════════════════════════════
    insertCustomer.run('CUST-001', 'Acme Corp', 'finance@acmecorp.com', 'high', 'active');
    const c1 = db.prepare('SELECT id FROM customers WHERE customer_code = ?').get('CUST-001') as { id: number };

    insertAccount.run('ACC-A001', c1.id, 'checking', 125000.00, 'active');
    insertAccount.run('ACC-A002', c1.id, 'business', 84000.00, 'active');
    insertAccount.run('ACC-A003', c1.id, 'savings', 53000.00, 'active');
    insertAccount.run('ACC-A004', c1.id, 'checking', 31000.00, 'active');

    // Shared device across all 4 accounts
    insertDevice.run('DEV-ACME-001', 'mobile', 'iOS 18');
    const devAcme = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-ACME-001') as { id: number };
    for (const num of ['ACC-A001', 'ACC-A002', 'ACC-A003', 'ACC-A004']) {
      linkDeviceAccount.run(devAcme.id, getAccountId(num));
    }

    // Circular: A001 → A002 → A003 → A001 (classic layering)
    insertTransaction.run('TXN-001', getAccountId('ACC-A001'), getAccountId('ACC-A002'), 15000.00, 'USD', 'completed', '-2 days', '-2 days');
    insertTransaction.run('TXN-002', getAccountId('ACC-A002'), getAccountId('ACC-A003'), 15000.00, 'USD', 'completed', '-2 days', '-2 days');
    insertTransaction.run('TXN-003', getAccountId('ACC-A003'), getAccountId('ACC-A001'), 15000.00, 'USD', 'completed', '-1 days', '-1 days');

    // Rapid dispersal from A004 to external
    insertTransaction.run('TXN-004', getAccountId('ACC-A004'), getAccountId('ACC-A001'), 8000.00, 'USD', 'completed', '-1 days', '-1 days');
    insertTransaction.run('TXN-005', getAccountId('ACC-A001'), getAccountId('ACC-A002'), 8000.00, 'USD', 'completed', '-1 days', '-1 days');

    insertAlert.run('ALT-001', c1.id, 'fund_dispersal', 'high', 'open',
      'Circular fund movement detected: ACC-A001 → ACC-A002 → ACC-A003 → ACC-A001 within 48 hours. Possible layering scheme.',
      '-1 days');

    // ════════════════════════════════════════════════════════════
    // SCENARIO 2: John Smith — Structuring (smurfing)
    // ════════════════════════════════════════════════════════════
    insertCustomer.run('CUST-002', 'John Smith', 'john.smith@mail.com', 'medium', 'flagged');
    const c2 = db.prepare('SELECT id FROM customers WHERE customer_code = ?').get('CUST-002') as { id: number };

    insertAccount.run('ACC-B001', c2.id, 'checking', 12400.00, 'active');
    insertAccount.run('ACC-B002', c2.id, 'savings', 8900.00, 'active');
    insertAccount.run('ACC-B003', c2.id, 'business', 45000.00, 'active');

    // Two devices — personal phone + work laptop
    insertDevice.run('DEV-SMITH-001', 'mobile', 'Android 15');
    insertDevice.run('DEV-SMITH-002', 'desktop', 'Windows 11');
    const devSmith1 = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-SMITH-001') as { id: number };
    const devSmith2 = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-SMITH-002') as { id: number };
    linkDeviceAccount.run(devSmith1.id, getAccountId('ACC-B001'));
    linkDeviceAccount.run(devSmith1.id, getAccountId('ACC-B002'));
    linkDeviceAccount.run(devSmith2.id, getAccountId('ACC-B003'));

    // Multiple deposits just below $10,000 CTR threshold
    insertTransaction.run('TXN-006', getAccountId('ACC-B003'), getAccountId('ACC-B001'), 9500.00, 'USD', 'completed', '-5 days', '-5 days');
    insertTransaction.run('TXN-007', getAccountId('ACC-B003'), getAccountId('ACC-B001'), 9200.00, 'USD', 'completed', '-4 days', '-4 days');
    insertTransaction.run('TXN-008', getAccountId('ACC-B003'), getAccountId('ACC-B001'), 9800.00, 'USD', 'completed', '-4 days', '-4 days');
    insertTransaction.run('TXN-009', getAccountId('ACC-B003'), getAccountId('ACC-B002'), 9700.00, 'USD', 'completed', '-3 days', '-3 days');
    insertTransaction.run('TXN-010', getAccountId('ACC-B003'), getAccountId('ACC-B001'), 9400.00, 'USD', 'completed', '-3 days', '-3 days');
    insertTransaction.run('TXN-011', getAccountId('ACC-B003'), getAccountId('ACC-B002'), 9600.00, 'USD', 'completed', '-2 days', '-2 days');
    insertTransaction.run('TXN-012', getAccountId('ACC-B001'), getAccountId('ACC-B002'), 25000.00, 'USD', 'completed', '-1 days', '-1 days');

    insertAlert.run('ALT-002', c2.id, 'structuring', 'high', 'open',
      'Six deposits of $9,200–$9,800 from business account to personal accounts within 3 days. Amounts consistently below $10,000 CTR threshold.',
      '-2 days');

    // ════════════════════════════════════════════════════════════
    // SCENARIO 3: Global Trade LLC — Velocity / rapid movement
    // ════════════════════════════════════════════════════════════
    insertCustomer.run('CUST-003', 'Global Trade LLC', 'ops@globaltrade.co', 'critical', 'active');
    const c3 = db.prepare('SELECT id FROM customers WHERE customer_code = ?').get('CUST-003') as { id: number };

    insertAccount.run('ACC-C001', c3.id, 'business', 250000.00, 'active');
    insertAccount.run('ACC-C002', c3.id, 'business', 180000.00, 'active');
    insertAccount.run('ACC-C003', c3.id, 'checking', 15000.00, 'active');
    insertAccount.run('ACC-C004', c3.id, 'savings', 92000.00, 'frozen');

    insertDevice.run('DEV-GLOBAL-001', 'desktop', 'macOS 15');
    const devGlobal = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-GLOBAL-001') as { id: number };
    linkDeviceAccount.run(devGlobal.id, getAccountId('ACC-C001'));
    linkDeviceAccount.run(devGlobal.id, getAccountId('ACC-C002'));
    linkDeviceAccount.run(devGlobal.id, getAccountId('ACC-C003'));

    // High-velocity: 8 transfers within 2 hours
    insertTransaction.run('TXN-013', getAccountId('ACC-C001'), getAccountId('ACC-C002'), 50000.00, 'USD', 'completed', '-1 days', '-1 days');
    insertTransaction.run('TXN-014', getAccountId('ACC-C002'), getAccountId('ACC-C003'), 50000.00, 'USD', 'completed', '-1 days', '-1 days');
    insertTransaction.run('TXN-015', getAccountId('ACC-C003'), getAccountId('ACC-C001'), 49500.00, 'USD', 'completed', '-1 days', '-1 days');
    insertTransaction.run('TXN-016', getAccountId('ACC-C001'), getAccountId('ACC-C002'), 49500.00, 'USD', 'completed', '-1 days', '-1 days');
    insertTransaction.run('TXN-017', getAccountId('ACC-C002'), getAccountId('ACC-C003'), 49000.00, 'USD', 'completed', '-1 days', '-1 days');
    insertTransaction.run('TXN-018', getAccountId('ACC-C003'), getAccountId('ACC-C001'), 49000.00, 'USD', 'completed', '-1 days', '-1 days');
    insertTransaction.run('TXN-019', getAccountId('ACC-C001'), getAccountId('ACC-C004'), 75000.00, 'USD', 'flagged', '-1 days', null);
    insertTransaction.run('TXN-020', getAccountId('ACC-C004'), getAccountId('ACC-C002'), 75000.00, 'USD', 'completed', '-1 days', '-1 days');

    // Cross-border wire
    insertTransaction.run('TXN-021', getAccountId('ACC-C002'), getAccountId('ACC-C001'), 120000.00, 'EUR', 'completed', '-12 hours', '-12 hours');

    insertAlert.run('ALT-003', c3.id, 'velocity', 'critical', 'open',
      'Eight high-value transfers ($49K–$50K) between linked business accounts within 2 hours. Rapid cycling pattern with decreasing amounts suggests fund mixing.',
      '-1 days');
    insertAlert.run('ALT-004', c3.id, 'fund_dispersal', 'high', 'investigating',
      'Cross-border wire of €120,000 to own account. Combined with velocity pattern raises layering concerns.',
      '-12 hours');

    // ════════════════════════════════════════════════════════════
    // SCENARIO 4: Maria Garcia — Geo anomaly / device sharing
    // ════════════════════════════════════════════════════════════
    insertCustomer.run('CUST-004', 'Maria Garcia', 'maria.garcia@email.com', 'medium', 'active');
    const c4 = db.prepare('SELECT id FROM customers WHERE customer_code = ?').get('CUST-004') as { id: number };

    insertAccount.run('ACC-D001', c4.id, 'checking', 28000.00, 'active');
    insertAccount.run('ACC-D002', c4.id, 'savings', 67000.00, 'active');

    // Device shared with CUST-005 (suspicious overlap)
    insertDevice.run('DEV-GARCIA-001', 'mobile', 'iOS 18');
    const devGarcia = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-GARCIA-001') as { id: number };
    linkDeviceAccount.run(devGarcia.id, getAccountId('ACC-D001'));
    linkDeviceAccount.run(devGarcia.id, getAccountId('ACC-D002'));

    insertDevice.run('DEV-GARCIA-002', 'desktop', 'Ubuntu 24.04');
    const devGarcia2 = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-GARCIA-002') as { id: number };
    linkDeviceAccount.run(devGarcia2.id, getAccountId('ACC-D001'));

    // Transactions that look normal at first
    insertTransaction.run('TXN-022', getAccountId('ACC-D001'), getAccountId('ACC-D002'), 5000.00, 'USD', 'completed', '-7 days', '-7 days');
    insertTransaction.run('TXN-023', getAccountId('ACC-D002'), getAccountId('ACC-D001'), 3000.00, 'USD', 'completed', '-6 days', '-6 days');
    insertTransaction.run('TXN-024', getAccountId('ACC-D001'), getAccountId('ACC-D002'), 12000.00, 'USD', 'completed', '-3 days', '-3 days');
    insertTransaction.run('TXN-025', getAccountId('ACC-D002'), getAccountId('ACC-D001'), 12000.00, 'USD', 'completed', '-3 days', '-3 days');

    insertAlert.run('ALT-005', c4.id, 'geo_anomaly', 'medium', 'open',
      'Account accessed from two different countries (US, Mexico) within 3-hour window. Device DEV-GARCIA-001 also linked to accounts under different customer profile.',
      '-3 days');

    // ════════════════════════════════════════════════════════════
    // SCENARIO 5: TechStart Inc — Synthetic identity / account takeover
    // ════════════════════════════════════════════════════════════
    insertCustomer.run('CUST-005', 'TechStart Inc', 'admin@techstart.io', 'low', 'active');
    const c5 = db.prepare('SELECT id FROM customers WHERE customer_code = ?').get('CUST-005') as { id: number };

    insertAccount.run('ACC-E001', c5.id, 'business', 340000.00, 'active');
    insertAccount.run('ACC-E002', c5.id, 'checking', 22000.00, 'active');
    insertAccount.run('ACC-E003', c5.id, 'savings', 150000.00, 'active');

    insertDevice.run('DEV-TECH-001', 'desktop', 'macOS 15');
    const devTech = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-TECH-001') as { id: number };
    linkDeviceAccount.run(devTech.id, getAccountId('ACC-E001'));
    linkDeviceAccount.run(devTech.id, getAccountId('ACC-E002'));

    insertDevice.run('DEV-TECH-002', 'mobile', 'iOS 18');
    const devTech2 = db.prepare('SELECT id FROM devices WHERE device_id = ?').get('DEV-TECH-002') as { id: number };
    linkDeviceAccount.run(devTech2.id, getAccountId('ACC-E003'));

    // Legitimate-looking payroll and vendor payments
    insertTransaction.run('TXN-026', getAccountId('ACC-E001'), getAccountId('ACC-E002'), 15000.00, 'USD', 'completed', '-10 days', '-10 days');
    insertTransaction.run('TXN-027', getAccountId('ACC-E002'), getAccountId('ACC-E001'), 8000.00, 'USD', 'completed', '-9 days', '-9 days');
    insertTransaction.run('TXN-028', getAccountId('ACC-E001'), getAccountId('ACC-E003'), 25000.00, 'USD', 'completed', '-5 days', '-5 days');

    insertAlert.run('ALT-006', c5.id, 'manual_escalation', 'low', 'closed',
      'Manual review request: routine audit of business account activity. No anomalies detected.',
      '-5 days');

    // ════════════════════════════════════════════════════════════
    // CASES — Pre-existing open cases for demo
    // ════════════════════════════════════════════════════════════
    // Get alert IDs
    const alt1 = db.prepare('SELECT id FROM alerts WHERE alert_id = ?').get('ALT-001') as { id: number };
    const alt3 = db.prepare('SELECT id FROM alerts WHERE alert_id = ?').get('ALT-003') as { id: number };
    const alt5 = db.prepare('SELECT id FROM alerts WHERE alert_id = ?').get('ALT-005') as { id: number };

    insertCase.run('CASE-001', alt1.id, c1.id,
      'Fund dispersal investigation — Acme Corp', 'investigating', 'high', 'J. Williams');
    insertCase.run('CASE-002', alt3.id, c3.id,
      'Velocity alert — Global Trade LLC', 'open', 'urgent', 'S. Patel');
    insertCase.run('CASE-003', alt5.id, c4.id,
      'Geo anomaly review — Maria Garcia', 'open', 'normal', null);

    // Update alert statuses for cases
    db.prepare(`UPDATE alerts SET status = 'investigating' WHERE alert_id = 'ALT-003'`).run();
    db.prepare(`UPDATE alerts SET status = 'investigating' WHERE alert_id = 'ALT-005'`).run();

    // ════════════════════════════════════════════════════════════
    // AUDIT LOG — Seed some historical entries
    // ════════════════════════════════════════════════════════════
    insertAuditLog.run('ingest_alert',
      JSON.stringify({ customerId: 'CUST-001', alertType: 'fund_dispersal', severity: 'high' }),
      JSON.stringify({ alertId: 'ALT-001' }),
      'system', 'system', '-1 days');

    insertAuditLog.run('create_case',
      JSON.stringify({ alertId: 'ALT-001' }),
      JSON.stringify({ caseId: 'CASE-001' }),
      'J. Williams', 'l2_investigator', '-1 days');

    insertAuditLog.run('expand_entity_graph',
      JSON.stringify({ customerId: 'CUST-003' }),
      JSON.stringify({ accounts: 4, devices: 1, transactions: 9 }),
      'S. Patel', 'l2_investigator', '-1 days');

    insertAuditLog.run('flag_layering_pattern',
      JSON.stringify({ customerId: 'CUST-003' }),
      JSON.stringify({ cycles: [['ACC-C001', 'ACC-C002', 'ACC-C003', 'ACC-C001']] }),
      'S. Patel', 'l2_investigator', '-12 hours');

    insertAuditLog.run('score_alert',
      JSON.stringify({ alertId: 'ALT-003' }),
      JSON.stringify({ score: 92, factors: { severity: 'critical', volume: 'high', cycles: 2 } }),
      'S. Patel', 'l2_investigator', '-12 hours');

    // ════════════════════════════════════════════════════════════
    // RAG — REGULATORY DOCUMENTS
    // ════════════════════════════════════════════════════════════
    const ragDocs: Array<{ id: string; title: string; type: string; source: string; content: string }> = [
      {
        id: 'REG-BSA-001',
        title: 'Bank Secrecy Act — Currency Transaction Reporting',
        type: 'regulation',
        source: 'FinCEN / 31 CFR 1010.310',
        content: `CURRENCY TRANSACTION REPORTING (CTR) REQUIREMENTS

Under the Bank Secrecy Act (BSA), financial institutions must file a Currency Transaction Report (CTR) for each transaction or series of related transactions involving more than $10,000 in currency (coin or paper money).

KEY REQUIREMENTS:
- CTR must be filed within 15 calendar days of the transaction
- Applies to deposits, withdrawals, currency exchanges, and other monetary instruments
- Multiple transactions by the same person within one business day must be aggregated
- Structuring (breaking transactions to avoid the $10,000 threshold) is a federal crime under 31 USC 5324

STRUCTURING INDICATORS:
- Multiple cash deposits just below $10,000 (e.g., $9,000-$9,900) within a short period
- Deposits spread across multiple branches or accounts
- Same individual making deposits at different locations on the same day
- Pattern of deposits that consistently fall below reporting thresholds

PENALTIES:
- Willful structuring: up to $250,000 fine and/or 5 years imprisonment
- Failure to file CTR: up to $500,000 fine for institutions
- Repeat offenses: enhanced penalties up to $1,000,000

RED FLAGS FOR INVESTIGATORS:
1. Customer appears to be conducting transactions designed to avoid CTR filing
2. Multiple accounts used to aggregate funds below threshold
3. Use of multiple individuals (smurfs) to make deposits
4. Rapid movement of funds after deposit
5. Inconsistency between account activity and stated business purpose`
      },
      {
        id: 'REG-AML-002',
        title: 'AML Compliance — Mule Account Detection Guidance',
        type: 'guidance',
        source: 'FinCEN Advisory FIN-2020-A007',
        content: `DETECTION AND REPORTING OF MONEY MULE ACTIVITY

Money mules are individuals who transfer illegally obtained money on behalf of others, often recruited through job scams or romance fraud. Financial institutions play a critical role in detecting and disrupting mule networks.

COMMON MULE ACCOUNT INDICATORS:
- Account opened with minimal identity verification
- Sudden increase in transaction volume after period of inactivity
- Funds rapidly transferred out shortly after receipt
- Multiple accounts linked to the same device, IP address, or phone number
- Accounts receiving funds from multiple unrelated third parties
- Geographic inconsistency: account holder in one location, transactions from another

DEVICE AND IP CORRELATION:
- Same device accessing multiple accounts belonging to different customers
- Login from IP addresses in different countries within short timeframes
- Use of VPN or proxy services to mask true location
- Device fingerprint shared across seemingly unrelated accounts

LAYERING PATTERNS:
- Circular fund flows: Account A -> B -> C -> A
- Funnel accounts: Multiple accounts feed into single account
- Spiral patterns: Funds move through decreasing amounts
- Rapid movement: Funds deposited and withdrawn within 24-48 hours

REPORTING OBLIGATIONS:
- File SAR within 30 days of detection (or 60 days if no suspect identified)
- Include all connected accounts and entities in SAR narrative
- Document the complete fund flow trail with transaction references
- Note any shared devices, IPs, or other linkage indicators`
      },
      {
        id: 'REG-SAR-003',
        title: 'SAR Filing Requirements and Best Practices',
        type: 'playbook',
        source: 'FinCEN SAR Filing Instructions',
        content: `SUSPICIOUS ACTIVITY REPORT (SAR) FILING GUIDE

WHEN TO FILE:
- Transaction involves funds derived from illegal activity
- Transaction is designed to evade BSA requirements (structuring)
- Transaction has no lawful purpose or is unusual for the customer
- Transaction is designed to facilitate criminal activity

SAR NARRATIVE BEST PRACTICES:
1. WHO: Identify the subject(s) — full names, DOBs, SSNs, account numbers
2. WHAT: Describe the suspicious activity clearly and chronologically
3. WHEN: Include specific dates, times, and timeframes
4. WHERE: Note branch locations, online activity, geographic indicators
5. WHY: Explain why the activity is suspicious — connect facts to conclusion
6. HOW: Describe the method or scheme used

NARRATIVE STRUCTURE:
- Opening: State the alert trigger and subject identification
- Background: Customer relationship and normal expected activity
- Analysis: Transaction details, patterns, and anomalies
- Red Flags: Specific indicators observed
- Conclusion: Summary of suspicion and recommended action

COMMON NARRATIVE ERRORS:
- Vague descriptions without specific transaction details
- Failing to explain WHY the activity is suspicious
- Omitting connected accounts or counterparties
- Not including the complete fund flow trail
- Using jargon without explanation

TIMELINE:
- File within 30 days of initial detection
- If no suspect identified: within 60 days
- Use FinCEN BSA E-Filing system
- Retain supporting documentation for 5 years`
      },
      {
        id: 'REG-CIRC-004',
        title: 'Circular Fund Flow Analysis Methodology',
        type: 'playbook',
        source: 'Internal Investigation Manual',
        content: `CIRCULAR FUND FLOW DETECTION AND ANALYSIS

Circular fund flows (also called round-tripping or layering cycles) are a key indicator of money laundering. Funds originate from a source account, pass through one or more intermediary accounts, and return to or near the origin.

DETECTION METHODOLOGY:
1. Build complete transaction graph for subject accounts
2. Construct adjacency matrix of all fund transfers
3. Apply depth-first search (DFS) to identify cycles
4. Calculate cycle characteristics: length, total volume, time window

CYCLE CLASSIFICATION:
- Simple cycle (3 nodes): A -> B -> C -> A — classic layering
- Complex cycle (4+ nodes): Extended chain with more intermediaries
- Self-referencing: Funds return through different instruments (wire out, check in)
- Multi-currency: Cycle crosses currency boundaries to obscure trail

ANALYSIS FACTORS:
- Time between cycle legs (faster = more suspicious)
- Amount consistency (round numbers suggest deliberate structuring)
- Account age and activity level (new accounts in cycle = higher risk)
- Device/IP overlap (same device accessing multiple cycle accounts)
- Counterparty relationships (known associates, shell companies)

SCORING METHODOLOGY:
- Severity weight: low=1, medium=2, high=3
- Volume weight: calculated as min(5, totalAmount / 10,000)
- Cycle weight: min(5, cyclesDetected * 2)
- Normalized score: (raw / maxPossible) * 100

INVESTIGATION STEPS:
1. Expand entity graph to identify all connected accounts
2. Run cycle detection algorithm
3. Map device and IP overlaps
4. Build chronological timeline
5. Draft escalation note with findings`
      },
      {
        id: 'REG-VEL-005',
        title: 'Velocity Alert Investigation Procedures',
        type: 'playbook',
        source: 'Internal Investigation Manual',
        content: `VELOCITY ALERT INVESTIGATION PROCEDURES

Velocity alerts trigger when transaction frequency or volume exceeds expected thresholds within defined time windows.

INVESTIGATION WORKFLOW:
1. Review alert parameters: threshold, time window, transaction types
2. Pull complete transaction history for flagged accounts
3. Calculate actual velocity metrics vs. baseline
4. Identify whether velocity is organic or artificial
5. Cross-reference with device and IP activity

RED FLAGS FOR ARTIFICIAL VELOCITY:
- Rapid movement between linked accounts (in-and-out patterns)
- Transactions at unusual hours for the account holder
- Multiple transactions in rapid succession (< 5 minutes apart)
- Volume inconsistent with stated account purpose
- Geographic impossibility (transactions from distant locations)

VELOCITY SCORING:
- Transaction count velocity: numTransactions / timeWindow
- Dollar volume velocity: totalAmount / timeWindow
- Comparative velocity: subject velocity / peer group average
- Temporal concentration: % of transactions in shortest time window

COMMON SCHEMES:
- Layering: Rapid movement through multiple accounts to obscure origin
- Fund mixing: Pooling and redistribution across mule network
- Trading manipulation: High-frequency wash trades
- Insurance fraud: Rapid claim submission and payout

DOCUMENTATION REQUIREMENTS:
- Transaction timestamps with timezone
- Channel used (online, branch, ATM, wire)
- Counterparty identification
- Device and session metadata
- Comparison to customer profile and expected activity`
      },
      {
        id: 'REG-GEO-006',
        title: 'Geographic Anomaly Detection Guidelines',
        type: 'guidance',
        source: 'AML Operations Manual',
        content: `GEOGRAPHIC ANOMALY DETECTION AND INVESTIGATION

Geographic anomalies occur when account activity originates from locations inconsistent with the customer's known profile or established patterns.

TYPES OF GEOGRAPHIC ANOMALIES:
1. Impossible travel: Transactions from two distant locations within timeframe insufficient for physical travel
2. High-risk jurisdiction: Activity involving countries on FATF grey/black lists
3. Location inconsistency: Account access from countries where customer has no known ties
4. IP geolocation mismatch: VPN usage or proxy detection

INVESTIGATION APPROACH:
- Verify customer's known addresses and travel patterns
- Cross-reference IP addresses with device fingerprints
- Check for VPN/proxy indicators in connection metadata
- Map all geographic points of activity
- Identify potential accomplices in same geographic cluster

FATF HIGH-RISK JURISDICTIONS:
- Refer to current FATF grey and black lists
- Enhanced due diligence for transactions involving these regions
- Consider sanctions screening implications
- Document nexus to customer's stated business

TECHNICAL INDICATORS:
- IP address geolocation vs. device GPS
- Mobile device cell tower data
- Browser timezone settings
- Language and locale settings
- Time of access patterns`

      },
    ];

    for (const doc of ragDocs) {
      insertDocument.run(doc.id, doc.title, doc.type, doc.source, doc.content);

      const docRow = db.prepare('SELECT id FROM documents WHERE doc_id = ?').get(doc.id) as { id: number };

      // Chunk by paragraphs
      const paragraphs = doc.content.split(/\n\n+/).filter(p => p.trim().length > 0);
      let chunkIndex = 0;
      let currentChunk = '';

      for (const para of paragraphs) {
        if (currentChunk.length + para.length > 500 && currentChunk.length > 0) {
          const keywords = extractKeywords(currentChunk);
          insertChunk.run(docRow.id, chunkIndex, currentChunk.trim(), keywords);
          chunkIndex++;
          currentChunk = '';
        }
        currentChunk += para + '\n\n';
      }
      if (currentChunk.trim().length > 0) {
        const keywords = extractKeywords(currentChunk);
        insertChunk.run(docRow.id, chunkIndex, currentChunk.trim(), keywords);
      }
    }

    // ════════════════════════════════════════════════════════════
    // KNOWLEDGE GRAPH — ENTITIES & RELATIONSHIPS
    // ════════════════════════════════════════════════════════════

    // --- People ---
    insertEntity.run('ENT-PER-001', 'person', 'Robert Chen', JSON.stringify({ role: 'CEO', company: 'Acme Corp' }), 0.3);
    insertEntity.run('ENT-PER-002', 'person', 'John Smith', JSON.stringify({ occupation: 'Consultant' }), 0.75);
    insertEntity.run('ENT-PER-003', 'person', 'Maria Garcia', JSON.stringify({ occupation: 'Freelancer' }), 0.55);
    insertEntity.run('ENT-PER-004', 'person', 'David Kim', JSON.stringify({ role: 'CFO', company: 'Global Trade LLC' }), 0.85);
    insertEntity.run('ENT-PER-005', 'person', 'Sarah Williams', JSON.stringify({ role: 'Controller', company: 'TechStart Inc' }), 0.2);
    insertEntity.run('ENT-PER-006', 'person', 'Ahmed Hassan', JSON.stringify({ role: 'Unknown', notes: 'Possible mule handler' }), 0.9);
    insertEntity.run('ENT-PER-007', 'person', 'Lisa Park', JSON.stringify({ occupation: 'Accountant' }), 0.4);

    // --- Companies ---
    insertEntity.run('ENT-COMP-001', 'company', 'Acme Corp', JSON.stringify({ industry: 'Trading', risk: 'high' }), 0.6);
    insertEntity.run('ENT-COMP-002', 'company', 'Global Trade LLC', JSON.stringify({ industry: 'Import/Export', risk: 'critical' }), 0.9);
    insertEntity.run('ENT-COMP-003', 'company', 'TechStart Inc', JSON.stringify({ industry: 'Technology', risk: 'low' }), 0.15);
    insertEntity.run('ENT-COMP-004', 'company', 'Shell Holdings Ltd', JSON.stringify({ industry: 'Unknown', jurisdiction: 'Cayman Islands', risk: 'high' }), 0.8);
    insertEntity.run('ENT-COMP-005', 'company', 'QuickCash Services', JSON.stringify({ industry: 'Money Services', risk: 'high' }), 0.7);

    // --- Accounts ---
    insertEntity.run('ENT-ACC-A001', 'account', 'ACC-A001', JSON.stringify({ type: 'checking', balance: 125000, customer: 'CUST-001' }), 0.6);
    insertEntity.run('ENT-ACC-A002', 'account', 'ACC-A002', JSON.stringify({ type: 'business', balance: 84000, customer: 'CUST-001' }), 0.5);
    insertEntity.run('ENT-ACC-A003', 'account', 'ACC-A003', JSON.stringify({ type: 'savings', balance: 53000, customer: 'CUST-001' }), 0.5);
    insertEntity.run('ENT-ACC-A004', 'account', 'ACC-A004', JSON.stringify({ type: 'checking', balance: 31000, customer: 'CUST-001' }), 0.4);
    insertEntity.run('ENT-ACC-B001', 'account', 'ACC-B001', JSON.stringify({ type: 'checking', balance: 12400, customer: 'CUST-002' }), 0.7);
    insertEntity.run('ENT-ACC-B002', 'account', 'ACC-B002', JSON.stringify({ type: 'savings', balance: 8900, customer: 'CUST-002' }), 0.65);
    insertEntity.run('ENT-ACC-B003', 'account', 'ACC-B003', JSON.stringify({ type: 'business', balance: 45000, customer: 'CUST-002' }), 0.7);
    insertEntity.run('ENT-ACC-C001', 'account', 'ACC-C001', JSON.stringify({ type: 'business', balance: 250000, customer: 'CUST-003' }), 0.9);
    insertEntity.run('ENT-ACC-C002', 'account', 'ACC-C002', JSON.stringify({ type: 'business', balance: 180000, customer: 'CUST-003' }), 0.85);
    insertEntity.run('ENT-ACC-C003', 'account', 'ACC-C003', JSON.stringify({ type: 'checking', balance: 15000, customer: 'CUST-003' }), 0.8);
    insertEntity.run('ENT-ACC-C004', 'account', 'ACC-C004', JSON.stringify({ type: 'savings', balance: 92000, customer: 'CUST-003', status: 'frozen' }), 0.9);
    insertEntity.run('ENT-ACC-D001', 'account', 'ACC-D001', JSON.stringify({ type: 'checking', balance: 28000, customer: 'CUST-004' }), 0.5);
    insertEntity.run('ENT-ACC-D002', 'account', 'ACC-D002', JSON.stringify({ type: 'savings', balance: 67000, customer: 'CUST-004' }), 0.45);

    // --- Devices ---
    insertEntity.run('ENT-DEV-001', 'device', 'DEV-ACME-001', JSON.stringify({ type: 'mobile', os: 'iOS 18', linkedAccounts: ['ACC-A001','ACC-A002','ACC-A003','ACC-A004'] }), 0.5);
    insertEntity.run('ENT-DEV-002', 'device', 'DEV-SMITH-001', JSON.stringify({ type: 'mobile', os: 'Android 15' }), 0.6);
    insertEntity.run('ENT-DEV-003', 'device', 'DEV-SMITH-002', JSON.stringify({ type: 'desktop', os: 'Windows 11' }), 0.55);
    insertEntity.run('ENT-DEV-004', 'device', 'DEV-GLOBAL-001', JSON.stringify({ type: 'desktop', os: 'macOS 15' }), 0.85);
    insertEntity.run('ENT-DEV-005', 'device', 'DEV-GARCIA-001', JSON.stringify({ type: 'mobile', os: 'iOS 18', suspicious: 'Shared with CUST-005 accounts' }), 0.6);
    insertEntity.run('ENT-DEV-006', 'device', 'DEV-TECH-001', JSON.stringify({ type: 'desktop', os: 'macOS 15' }), 0.15);

    // --- IP Addresses ---
    insertEntity.run('ENT-IP-001', 'ip_address', '192.168.1.100', JSON.stringify({ location: 'New York, US', isp: 'Comcast' }), 0.3);
    insertEntity.run('ENT-IP-002', 'ip_address', '10.0.0.55', JSON.stringify({ location: 'Mexico City, MX', isp: 'Telmex' }), 0.7);
    insertEntity.run('ENT-IP-003', 'ip_address', '172.16.0.10', JSON.stringify({ location: 'London, UK', isp: 'BT Group' }), 0.6);
    insertEntity.run('ENT-IP-004', 'ip_address', '198.51.100.42', JSON.stringify({ location: 'Dubai, UAE', isp: 'Etisalat' }), 0.8);

    // --- Beneficiaries ---
    insertEntity.run('ENT-BEN-001', 'beneficiary', 'Offshore Wire Services', JSON.stringify({ jurisdiction: 'Cayman Islands', type: 'wire_service' }), 0.85);
    insertEntity.run('ENT-BEN-002', 'beneficiary', 'QuickRemit Ltd', JSON.stringify({ jurisdiction: 'UK', type: 'remittance' }), 0.6);

    // --- Mule Handler ---
    insertEntity.run('ENT-MULE-001', 'mule_handler', 'Shadow Network Node', JSON.stringify({ estimatedMules: 12, region: 'Southeast Asia' }), 0.95);

    // --- Relationships: Ownership & Control ---
    insertRelationship.run('ENT-PER-001', 'ENT-COMP-001', 'owns', 1.0, JSON.stringify({ since: '2018' }));
    insertRelationship.run('ENT-PER-004', 'ENT-COMP-002', 'controls', 1.0, JSON.stringify({ role: 'CFO' }));
    insertRelationship.run('ENT-PER-005', 'ENT-COMP-003', 'employs', 0.8, JSON.stringify({ role: 'Controller' }));
    insertRelationship.run('ENT-PER-006', 'ENT-COMP-004', 'controls', 0.9, JSON.stringify({ hiddenBeneficiary: true }));
    insertRelationship.run('ENT-PER-006', 'ENT-MULE-001', 'is_mule_for', 0.95);

    // --- Relationships: Account Ownership ---
    insertRelationship.run('ENT-PER-001', 'ENT-ACC-A001', 'owns', 1.0);
    insertRelationship.run('ENT-PER-001', 'ENT-ACC-A002', 'owns', 1.0);
    insertRelationship.run('ENT-PER-001', 'ENT-ACC-A003', 'owns', 1.0);
    insertRelationship.run('ENT-PER-001', 'ENT-ACC-A004', 'owns', 1.0);
    insertRelationship.run('ENT-PER-002', 'ENT-ACC-B001', 'owns', 1.0);
    insertRelationship.run('ENT-PER-002', 'ENT-ACC-B002', 'owns', 1.0);
    insertRelationship.run('ENT-PER-002', 'ENT-ACC-B003', 'owns', 1.0);
    insertRelationship.run('ENT-PER-004', 'ENT-ACC-C001', 'owns', 1.0);
    insertRelationship.run('ENT-PER-004', 'ENT-ACC-C002', 'owns', 1.0);
    insertRelationship.run('ENT-PER-004', 'ENT-ACC-C003', 'owns', 1.0);
    insertRelationship.run('ENT-PER-004', 'ENT-ACC-C004', 'owns', 1.0);
    insertRelationship.run('ENT-PER-003', 'ENT-ACC-D001', 'owns', 1.0);
    insertRelationship.run('ENT-PER-003', 'ENT-ACC-D002', 'owns', 1.0);

    // --- Relationships: Device Usage ---
    insertRelationship.run('ENT-DEV-001', 'ENT-ACC-A001', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-001', 'ENT-ACC-A002', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-001', 'ENT-ACC-A003', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-001', 'ENT-ACC-A004', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-002', 'ENT-ACC-B001', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-002', 'ENT-ACC-B002', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-003', 'ENT-ACC-B003', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-004', 'ENT-ACC-C001', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-004', 'ENT-ACC-C002', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-004', 'ENT-ACC-C003', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-005', 'ENT-ACC-D001', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-005', 'ENT-ACC-D002', 'uses_device', 1.0);
    insertRelationship.run('ENT-DEV-005', 'ENT-ACC-A001', 'uses_device', 0.8); // Suspicious cross-customer device
    insertRelationship.run('ENT-DEV-006', 'ENT-ACC-C001', 'uses_device', 0.9);

    // --- Relationships: IP Usage ---
    insertRelationship.run('ENT-IP-001', 'ENT-ACC-A001', 'uses_ip', 0.9);
    insertRelationship.run('ENT-IP-001', 'ENT-ACC-A002', 'uses_ip', 0.8);
    insertRelationship.run('ENT-IP-002', 'ENT-ACC-D001', 'uses_ip', 0.7);
    insertRelationship.run('ENT-IP-003', 'ENT-ACC-C001', 'uses_ip', 0.85);
    insertRelationship.run('ENT-IP-004', 'ENT-ACC-C002', 'uses_ip', 0.75);

    // --- Relationships: Fund Transfers (suspicious) ---
    insertRelationship.run('ENT-ACC-A001', 'ENT-ACC-A002', 'transfers_to', 0.9, JSON.stringify({ pattern: 'circular', totalAmount: 23000 }));
    insertRelationship.run('ENT-ACC-A002', 'ENT-ACC-A003', 'transfers_to', 0.9, JSON.stringify({ pattern: 'circular', totalAmount: 15000 }));
    insertRelationship.run('ENT-ACC-A003', 'ENT-ACC-A001', 'transfers_to', 0.9, JSON.stringify({ pattern: 'circular', totalAmount: 15000 }));
    insertRelationship.run('ENT-ACC-B003', 'ENT-ACC-B001', 'transfers_to', 0.85, JSON.stringify({ pattern: 'structuring', count: 6 }));
    insertRelationship.run('ENT-ACC-B003', 'ENT-ACC-B002', 'transfers_to', 0.8, JSON.stringify({ pattern: 'structuring', count: 2 }));
    insertRelationship.run('ENT-ACC-B001', 'ENT-ACC-B002', 'transfers_to', 0.7, JSON.stringify({ amount: 25000 }));
    insertRelationship.run('ENT-ACC-C001', 'ENT-ACC-C002', 'transfers_to', 0.95, JSON.stringify({ pattern: 'velocity', count: 8 }));
    insertRelationship.run('ENT-ACC-C002', 'ENT-ACC-C003', 'transfers_to', 0.9, JSON.stringify({ pattern: 'velocity', count: 3 }));
    insertRelationship.run('ENT-ACC-C003', 'ENT-ACC-C001', 'transfers_to', 0.85, JSON.stringify({ pattern: 'circular' }));
    insertRelationship.run('ENT-ACC-C002', 'ENT-BEN-001', 'transfers_to', 0.9, JSON.stringify({ type: 'cross-border', currency: 'EUR', amount: 120000 }));

    // --- Relationships: Layering & Association ---
    insertRelationship.run('ENT-PER-006', 'ENT-COMP-005', 'associated_with', 0.8);
    insertRelationship.run('ENT-COMP-004', 'ENT-BEN-001', 'connected_to', 0.85);
    insertRelationship.run('ENT-PER-002', 'ENT-PER-006', 'connected_to', 0.6, JSON.stringify({ basis: 'shared device' }));
    insertRelationship.run('ENT-PER-003', 'ENT-PER-006', 'connected_to', 0.5, JSON.stringify({ basis: 'shared device' }));
    insertRelationship.run('ENT-PER-007', 'ENT-PER-004', 'associated_with', 0.4, JSON.stringify({ basis: 'business relationship' }));
  });

  seed();
  console.log('[seed] TraceLens seed data inserted successfully.');
  console.log('[seed] 5 customers, 16 accounts, 5 devices, 28 transactions, 6 alerts, 3 cases');
  console.log('[seed] 6 regulatory documents (RAG), 30+ knowledge graph entities with relationships');
  db.close();
}

runSeed();
