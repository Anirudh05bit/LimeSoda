import { Injectable } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../database/db-path.js';

interface CreateAlertInput {
  customerId: string;
  alertType: 'velocity' | 'structuring' | 'geo_anomaly' | 'fund_dispersal';
  severity: 'low' | 'medium' | 'high';
}

@Injectable()
export class AlertService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  createAlert(input: CreateAlertInput) {
    const customer = this.db.prepare(
      `SELECT id FROM customers WHERE customer_code = ?`
    ).get(input.customerId) as { id: number } | undefined;

    if (!customer) {
      throw new Error(`Customer not found: ${input.customerId}`);
    }

    const alertCount = this.db.prepare(
      `SELECT COUNT(*) AS n FROM alerts`
    ).get() as { n: number };
    const alertId = `ALT-${String(alertCount.n + 1).padStart(3, '0')}`;

    this.db.prepare(
      `INSERT INTO alerts (alert_id, customer_id, alert_type, severity, status, description)
       VALUES (?, ?, ?, ?, 'open', ?)`
    ).run(
      alertId,
      customer.id,
      input.alertType,
      input.severity,
      `Auto-generated ${input.alertType} alert for ${input.customerId}`
    );

    return {
      alertId,
      customerId: input.customerId,
      alertType: input.alertType,
      severity: input.severity,
      status: 'open' as const,
    };
  }

  createCaseFromAlert(alertId: string) {
    const alert = this.db.prepare(
      `SELECT a.id, a.alert_id, a.alert_type, a.severity, a.customer_id,
              cu.customer_code
       FROM alerts a
       JOIN customers cu ON cu.id = a.customer_id
       WHERE a.alert_id = ?`
    ).get(alertId) as {
      id: number;
      alert_id: string;
      alert_type: string;
      severity: string;
      customer_id: number;
      customer_code: string;
    } | undefined;

    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const caseCount = this.db.prepare(
      `SELECT COUNT(*) AS n FROM cases`
    ).get() as { n: number };
    const caseId = `CASE-${String(caseCount.n + 1).padStart(3, '0')}`;

    const title = `${alert.alert_type.replace(/_/g, ' ')} investigation — ${alert.customer_code}`;

    this.db.prepare(
      `INSERT INTO cases (case_id, alert_id, customer_id, title, status, priority)
       VALUES (?, ?, ?, ?, 'open', ?)`
    ).run(
      caseId,
      alert.id,
      alert.customer_id,
      title,
      alert.severity === 'high' ? 'high' : 'normal'
    );

    this.db.prepare(
      `UPDATE alerts SET status = 'investigating', updated_at = datetime('now')
       WHERE alert_id = ?`
    ).run(alertId);

    return {
      caseId,
      alertId,
      status: 'open' as const,
      priority: alert.severity === 'high' ? 'high' as const : 'normal' as const,
    };
  }
}
