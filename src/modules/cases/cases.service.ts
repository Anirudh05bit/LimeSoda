import { Injectable } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { join } from 'node:path';

const DB_PATH = join(process.cwd(), 'tracelens.db');

@Injectable()
export class CaseService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  getCustomerProfile(customerId: string) {
    const customer = this.db.prepare(
      `SELECT id, customer_code, name, email, risk_rating, status, created_at, updated_at
       FROM customers WHERE customer_code = ?`
    ).get(customerId) as Record<string, unknown> | undefined;

    if (!customer) return null;

    const accounts = this.db.prepare(
      `SELECT id, account_number, account_type, balance, status
       FROM accounts WHERE customer_id = ?`
    ).all(customer.id) as Array<Record<string, unknown>>;

    const accountIds = accounts.map(a => a.id);
    let devices: Array<Record<string, unknown>> = [];
    if (accountIds.length > 0) {
      const placeholders = accountIds.map(() => '?').join(',');
      devices = this.db.prepare(
        `SELECT DISTINCT d.id, d.device_id, d.device_type, d.os, d.last_seen_at
         FROM devices d
         JOIN device_accounts da ON da.device_id = d.id
         WHERE da.account_id IN (${placeholders})`
      ).all(...accountIds) as Array<Record<string, unknown>>;
    }

    return {
      customer,
      accounts,
      devices,
    };
  }

  getTransactionTimeline(customerId: string) {
    const customer = this.db.prepare(
      `SELECT id FROM customers WHERE customer_code = ?`
    ).get(customerId) as { id: number } | undefined;

    if (!customer) return null;

    const timeline = this.db.prepare(
      `SELECT
         t.transaction_id,
         t.amount,
         t.currency,
         t.status,
         t.initiated_at,
         t.completed_at,
         fa.account_number AS from_account,
         ta.account_number AS to_account
       FROM transactions t
       JOIN accounts fa ON fa.id = t.from_account_id
       JOIN accounts ta ON ta.id = t.to_account_id
       WHERE fa.customer_id = ? OR ta.customer_id = ?
       ORDER BY t.initiated_at ASC`
    ).all(customer.id, customer.id) as Array<Record<string, unknown>>;

    return {
      customerId,
      transactionCount: timeline.length,
      timeline,
    };
  }

  getCaseEvidence(caseId: string) {
    const row = this.db.prepare(
      `SELECT
         c.id,
         c.case_id,
         c.title,
         c.status,
         c.priority,
         c.assigned_to,
         c.created_at AS case_created_at,
         c.updated_at AS case_updated_at,
         a.alert_id,
         a.alert_type,
         a.severity        AS alert_severity,
         a.status          AS alert_status,
         a.description     AS alert_description,
         a.detected_at,
         cu.customer_code,
         cu.name           AS customer_name,
         cu.risk_rating
       FROM cases c
       JOIN alerts a  ON a.id = c.alert_id
       JOIN customers cu ON cu.id = c.customer_id
       WHERE c.case_id = ?`
    ).get(caseId) as Record<string, unknown> | undefined;

    if (!row) return null;

    const accounts = this.db.prepare(
      `SELECT account_number, account_type, balance, status
       FROM accounts WHERE customer_id = (
         SELECT id FROM customers WHERE customer_code = ?
       )`
    ).all(row.customer_code) as Array<Record<string, unknown>>;

    const transactions = this.db.prepare(
      `SELECT
         t.transaction_id, t.amount, t.currency, t.status,
         t.initiated_at, t.completed_at,
         fa.account_number AS from_account,
         ta.account_number AS to_account
       FROM transactions t
       JOIN accounts fa ON fa.id = t.from_account_id
       JOIN accounts ta ON ta.id = t.to_account_id
       WHERE fa.customer_id = (
         SELECT id FROM customers WHERE customer_code = ?
       ) OR ta.customer_id = (
         SELECT id FROM customers WHERE customer_code = ?
       )
       ORDER BY t.initiated_at ASC`
    ).all(row.customer_code, row.customer_code) as Array<Record<string, unknown>>;

    return {
      case: {
        caseId: row.case_id,
        title: row.title,
        status: row.status,
        priority: row.priority,
        assignedTo: row.assigned_to,
        createdAt: row.case_created_at,
        updatedAt: row.case_updated_at,
      },
      alert: {
        alertId: row.alert_id,
        alertType: row.alert_type,
        severity: row.alert_severity,
        status: row.alert_status,
        description: row.alert_description,
        detectedAt: row.detected_at,
      },
      customer: {
        customerCode: row.customer_code,
        name: row.customer_name,
        riskRating: row.risk_rating,
      },
      accounts,
      transactions,
    };
  }
}
