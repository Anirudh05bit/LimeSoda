-- TraceLens OS v1.0 — SQLite Schema
-- Investigations & case management for financial crime analysis

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_code TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  email         TEXT,
  risk_rating   TEXT    NOT NULL DEFAULT 'low'   CHECK (risk_rating IN ('low','medium','high','critical')),
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','flagged')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number TEXT   NOT NULL UNIQUE,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  account_type  TEXT    NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking','savings','business')),
  balance       REAL    NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'active'   CHECK (status IN ('active','frozen','closed')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_customer ON accounts(customer_id);

-- ============================================================
-- DEVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT    NOT NULL UNIQUE,   -- hardware fingerprint / IMEI / browser hash
  device_type   TEXT    NOT NULL DEFAULT 'unknown' CHECK (device_type IN ('mobile','desktop','tablet','unknown')),
  os            TEXT,
  last_seen_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Junction: many-to-many (one device can appear across multiple accounts)
CREATE TABLE IF NOT EXISTS device_accounts (
  device_id  INTEGER NOT NULL REFERENCES devices(id)  ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  linked_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, account_id)
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id  TEXT    NOT NULL UNIQUE,
  from_account_id INTEGER NOT NULL REFERENCES accounts(id),
  to_account_id   INTEGER NOT NULL REFERENCES accounts(id),
  amount          REAL    NOT NULL CHECK (amount > 0),
  currency        TEXT    NOT NULL DEFAULT 'USD',
  status          TEXT    NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','flagged','reversed')),
  initiated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_txn_from ON transactions(from_account_id);
CREATE INDEX IF NOT EXISTS idx_txn_to   ON transactions(to_account_id);
CREATE INDEX IF NOT EXISTS idx_txn_time ON transactions(initiated_at);

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id    TEXT    NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  alert_type  TEXT    NOT NULL CHECK (alert_type IN ('fund_dispersal','structuring','velocity','geo_anomaly','manual_escalation')),
  severity    TEXT    NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status      TEXT    NOT NULL DEFAULT 'open'   CHECK (status IN ('open','investigating','escalated','closed')),
  description TEXT,
  detected_at TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_alerts_customer ON alerts(customer_id);

-- ============================================================
-- CASES
-- ============================================================
CREATE TABLE IF NOT EXISTS cases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id     TEXT    NOT NULL UNIQUE,
  alert_id    INTEGER NOT NULL REFERENCES alerts(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'open'        CHECK (status IN ('open','investigating','escalated','closed')),
  priority    TEXT    NOT NULL DEFAULT 'normal'      CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cases_alert  ON cases(alert_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name    TEXT NOT NULL,
  input_json   TEXT,           -- JSON string of tool input
  output_json  TEXT,           -- JSON string of tool output
  actor_subject TEXT,          -- who ran the tool (user id / agent id)
  actor_role    TEXT,          -- L1, L2, compliance_officer, system
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_tool    ON audit_log(tool_name);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log(actor_subject);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ============================================================
-- RAG — DOCUMENTS (regulatory references, SARs, playbooks)
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id        TEXT    NOT NULL UNIQUE,
  title         TEXT    NOT NULL,
  doc_type      TEXT    NOT NULL CHECK (doc_type IN ('regulation','sar_precedent','playbook','guidance')),
  source        TEXT,
  content       TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_docs_type ON documents(doc_type);

-- Chunks for retrieval (split from document content)
CREATE TABLE IF NOT EXISTS document_chunks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id   INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  content       TEXT    NOT NULL,
  keywords      TEXT,   -- comma-separated keywords for TF-IDF style retrieval
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(document_id);

-- ============================================================
-- KNOWLEDGE GRAPH — ENTITIES & RELATIONSHIPS
-- ============================================================
CREATE TABLE IF NOT EXISTS kg_entities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id     TEXT    NOT NULL UNIQUE,
  entity_type   TEXT    NOT NULL CHECK (entity_type IN ('person','company','account','device','ip_address','phone','email','beneficiary','mule_handler')),
  name          TEXT    NOT NULL,
  attributes    TEXT,   -- JSON blob for type-specific attributes
  risk_score    REAL    DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kg_entity_type ON kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_entity_id   ON kg_entities(entity_id);

CREATE TABLE IF NOT EXISTS kg_relationships (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_entity_id TEXT NOT NULL REFERENCES kg_entities(entity_id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES kg_entities(entity_id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'owns','controls','accesses','transfers_to','associated_with',
    'employs','registered_at','uses_device','uses_ip','receives_from',
    'is_mule_for','layered_through','connected_to'
  )),
  weight          REAL DEFAULT 1.0,
  attributes      TEXT,  -- JSON blob
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kg_rel_source ON kg_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_rel_target ON kg_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_rel_type   ON kg_relationships(relationship_type);
