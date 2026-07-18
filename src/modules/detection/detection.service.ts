import { Injectable } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../database/db-path.js';

export interface ZScoreResult {
  transactionId: string;
  amount: number;
  mean: number;
  stdDev: number;
  zScore: number;
  anomalous: boolean;
}

export interface VelocityResult {
  transactionCount: number;
  timeWindowHours: number;
  ratePerHour: number;
  totalVolume: number;
  threshold: number;
  flagged: boolean;
}

export interface GeoCheckResult {
  transactionId: string;
  fromLocation: string;
  toLocation: string;
  distanceKm: number;
  timeDiffMinutes: number;
  impossibleTravel: boolean;
  travelSpeedKmph: number;
}

export interface StructuringResult {
  accountNumber: string;
  transactionCount: number;
  amounts: number[];
  threshold: number;
  belowThresholdCount: number;
  flagged: boolean;
}

@Injectable()
export class DetectionService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  calculateZScore(customerId: string): ZScoreResult[] {
    const customer = this.db.prepare(
      `SELECT id FROM customers WHERE customer_code = ?`
    ).get(customerId) as { id: number } | undefined;
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const transactions = this.db.prepare(
      `SELECT t.id, t.transaction_id, t.amount, t.currency, t.status, t.initiated_at
       FROM transactions t
       JOIN accounts a ON a.id = t.from_account_id OR a.id = t.to_account_id
       WHERE a.customer_id = ?
       ORDER BY t.initiated_at ASC`
    ).all(customer.id) as Array<{ transaction_id: string; amount: number }>;

    if (transactions.length < 3) return [];

    const amounts = transactions.map(t => t.amount);
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return [];

    return transactions.map(t => {
      const zScore = (t.amount - mean) / stdDev;
      return {
        transactionId: t.transaction_id,
        amount: t.amount,
        mean: Math.round(mean * 100) / 100,
        stdDev: Math.round(stdDev * 100) / 100,
        zScore: Math.round(zScore * 100) / 100,
        anomalous: Math.abs(zScore) > 2,
      };
    });
  }

  checkVelocity(customerId: string, windowHours: number = 24): VelocityResult {
    const customer = this.db.prepare(
      `SELECT id FROM customers WHERE customer_code = ?`
    ).get(customerId) as { id: number } | undefined;
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const txns = this.db.prepare(
      `SELECT t.amount, t.initiated_at
       FROM transactions t
       JOIN accounts a ON a.id = t.from_account_id OR a.id = t.to_account_id
       WHERE a.customer_id = ?
       AND t.initiated_at >= datetime('now', ?)`
    ).all(customer.id, `-${windowHours} hours`) as Array<{ amount: number; initiated_at: string }>;

    const count = txns.length;
    const totalVolume = txns.reduce((s, t) => s + t.amount, 0);
    const ratePerHour = windowHours > 0 ? count / windowHours : count;
    const threshold = 5;

    return {
      transactionCount: count,
      timeWindowHours: windowHours,
      ratePerHour: Math.round(ratePerHour * 100) / 100,
      totalVolume,
      threshold,
      flagged: count > threshold,
    };
  }

  geoCheck(customerId: string): GeoCheckResult[] {
    const results: GeoCheckResult[] = [];
    const customer = this.db.prepare(
      `SELECT id FROM customers WHERE customer_code = ?`
    ).get(customerId) as { id: number } | undefined;
    if (!customer) return results;

    const txns = this.db.prepare(
      `SELECT t.transaction_id, t.initiated_at, fa.account_number AS from_acct,
              ta.account_number AS to_acct
       FROM transactions t
       JOIN accounts fa ON fa.id = t.from_account_id
       JOIN accounts ta ON ta.id = t.to_account_id
       WHERE fa.customer_id = ? OR ta.customer_id = ?
       ORDER BY t.initiated_at ASC`
    ).all(customer.id, customer.id) as Array<{
      transaction_id: string; initiated_at: string;
      from_acct: string; to_acct: string;
    }>;

    const locations: Record<string, { lat: number; lng: number }> = {
      'ACC-A001': { lat: 40.7128, lng: -74.006 },
      'ACC-A002': { lat: 40.7128, lng: -74.006 },
      'ACC-A003': { lat: 40.7128, lng: -74.006 },
      'ACC-A004': { lat: 40.7128, lng: -74.006 },
      'ACC-B001': { lat: 34.0522, lng: -118.2437 },
      'ACC-B002': { lat: 34.0522, lng: -118.2437 },
      'ACC-B003': { lat: 34.0522, lng: -118.2437 },
      'ACC-C001': { lat: 51.5074, lng: -0.1278 },
      'ACC-C002': { lat: 51.5074, lng: -0.1278 },
      'ACC-C003': { lat: 51.5074, lng: -0.1278 },
      'ACC-C004': { lat: 48.8566, lng: 2.3522 },
      'ACC-D001': { lat: 25.7617, lng: -80.1918 },
      'ACC-D002': { lat: 19.4326, lng: -99.1332 },
      'ACC-E001': { lat: 37.7749, lng: -122.4194 },
      'ACC-E002': { lat: 37.7749, lng: -122.4194 },
      'ACC-E003': { lat: 37.7749, lng: -122.4194 },
    };

    const getLoc = (acct: string) => locations[acct] || { lat: 0, lng: 0 };

    for (let i = 1; i < txns.length; i++) {
      const prev = txns[i - 1];
      const curr = txns[i];
      const pLoc = getLoc(prev.from_acct);
      const cLoc = getLoc(curr.to_acct);

      const R = 6371;
      const dLat = ((cLoc.lat - pLoc.lat) * Math.PI) / 180;
      const dLng = ((cLoc.lng - pLoc.lng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos((pLoc.lat * Math.PI) / 180) *
                Math.cos((cLoc.lat * Math.PI) / 180) *
                Math.sin(dLng / 2) ** 2;
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const t1 = new Date(prev.initiated_at).getTime();
      const t2 = new Date(curr.initiated_at).getTime();
      const timeDiff = Math.abs(t2 - t1) / (1000 * 60);

      const speedKmph = timeDiff > 0 ? distance / (timeDiff / 60) : 0;
      const impossible = speedKmph > 900;

      if (distance > 100) {
        results.push({
          transactionId: curr.transaction_id,
          fromLocation: `${pLoc.lat.toFixed(2)}, ${pLoc.lng.toFixed(2)}`,
          toLocation: `${cLoc.lat.toFixed(2)}, ${cLoc.lng.toFixed(2)}`,
          distanceKm: Math.round(distance),
          timeDiffMinutes: Math.round(timeDiff),
          impossibleTravel: impossible,
          travelSpeedKmph: Math.round(speedKmph),
        });
      }
    }

    return results;
  }

  detectStructuring(customerId: string, threshold: number = 10000): StructuringResult[] {
    const customer = this.db.prepare(
      `SELECT id FROM customers WHERE customer_code = ?`
    ).get(customerId) as { id: number } | undefined;
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const accounts = this.db.prepare(
      `SELECT id, account_number FROM accounts WHERE customer_id = ?`
    ).all(customer.id) as Array<{ id: number; account_number: string }>;

    return accounts.map(acct => {
      const txns = this.db.prepare(
        `SELECT amount FROM transactions
         WHERE (from_account_id = ? OR to_account_id = ?)
         AND amount < ?
         ORDER BY initiated_at ASC`
      ).all(acct.id, acct.id, threshold) as Array<{ amount: number }>;

      return {
        accountNumber: acct.account_number,
        transactionCount: txns.length,
        amounts: txns.map(t => t.amount),
        threshold,
        belowThresholdCount: txns.length,
        flagged: txns.length >= 3,
      };
    }).filter(r => r.flagged);
  }

  getCustomerHistory(customerId: string) {
    const profile = this.db.prepare(
      `SELECT id, customer_code, name, email, risk_rating, status, created_at
       FROM customers WHERE customer_code = ?`
    ).get(customerId) as Record<string, unknown> | undefined;
    if (!profile) throw new Error(`Customer not found: ${customerId}`);

    const accounts = this.db.prepare(
      `SELECT account_number, account_type, balance, status, created_at
       FROM accounts WHERE customer_id = ?`
    ).all(profile.id) as Array<Record<string, unknown>>;

    const accountIds = accounts.map(a => {
      const row = this.db.prepare('SELECT id FROM accounts WHERE account_number = ?').get(a.account_number) as { id: number };
      return row?.id;
    }).filter(Boolean);

    let recentTxns: Array<Record<string, unknown>> = [];
    if (accountIds.length > 0) {
      const placeholders = accountIds.map(() => '?').join(',');
      recentTxns = this.db.prepare(
        `SELECT transaction_id, amount, currency, status, initiated_at
         FROM transactions
         WHERE from_account_id IN (${placeholders}) OR to_account_id IN (${placeholders})
         ORDER BY initiated_at DESC LIMIT 20`
      ).all(...accountIds, ...accountIds) as Array<Record<string, unknown>>;
    }

    const alerts = this.db.prepare(
      `SELECT alert_id, alert_type, severity, status, detected_at
       FROM alerts WHERE customer_id = ?
       ORDER BY detected_at DESC LIMIT 10`
    ).all(profile.id) as Array<Record<string, unknown>>;

    const devices = this.db.prepare(
      `SELECT DISTINCT d.device_id, d.device_type, d.os, d.last_seen_at
       FROM devices d
       JOIN device_accounts da ON da.device_id = d.id
       WHERE da.account_id IN (${accountIds.map(() => '?').join(',')})`
    ).all(...accountIds) as Array<Record<string, unknown>>;

    return {
      customer: profile,
      accounts,
      recentTransactions: recentTxns,
      alertHistory: alerts,
      devices,
    };
  }

  buildTransactionGraph(customerId: string) {
    const customer = this.db.prepare(
      `SELECT id FROM customers WHERE customer_code = ?`
    ).get(customerId) as { id: number } | undefined;
    if (!customer) throw new Error(`Customer not found: ${customerId}`);

    const txns = this.db.prepare(
      `SELECT t.transaction_id, t.amount, t.currency, t.status, t.initiated_at,
              fa.account_number AS from_account, ta.account_number AS to_account
       FROM transactions t
       JOIN accounts fa ON fa.id = t.from_account_id
       JOIN accounts ta ON ta.id = t.to_account_id
       WHERE fa.customer_id = ? OR ta.customer_id = ?
       ORDER BY t.initiated_at ASC`
    ).all(customer.id, customer.id) as Array<{
      transaction_id: string; amount: number; currency: string;
      status: string; initiated_at: string;
      from_account: string; to_account: string;
    }>;

    const nodes = new Set<string>();
    const edges: Array<{ source: string; target: string; weight: number; metadata: Record<string, unknown> }> = [];

    for (const t of txns) {
      nodes.add(t.from_account);
      nodes.add(t.to_account);
      edges.push({
        source: t.from_account,
        target: t.to_account,
        weight: t.amount,
        metadata: {
          transaction_id: t.transaction_id,
          currency: t.currency,
          status: t.status,
          initiated_at: t.initiated_at,
        },
      });
    }

    return {
      customerId,
      nodes: Array.from(nodes),
      edges,
      totalVolume: txns.reduce((s, t) => s + t.amount, 0),
      transactionCount: txns.length,
    };
  }

  detectCycles(customerId: string) {
    const graph = this.buildTransactionGraph(customerId);
    const adjacency = new Map<string, string[]>();

    for (const node of graph.nodes) {
      adjacency.set(node, []);
    }
    for (const edge of graph.edges) {
      const neighbors = adjacency.get(edge.source);
      if (neighbors) neighbors.push(edge.target);
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      if (inStack.has(node)) {
        const start = path.indexOf(node);
        if (start !== -1) cycles.push([...path.slice(start), node]);
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      inStack.add(node);
      path.push(node);
      for (const neighbor of adjacency.get(node) || []) dfs(neighbor);
      path.pop();
      inStack.delete(node);
    };

    for (const node of graph.nodes) dfs(node);

    return {
      customerId,
      cyclesDetected: cycles.length,
      cycles,
      totalVolume: graph.totalVolume,
    };
  }
}
