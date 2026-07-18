import { Injectable } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../database/db-path.js';

interface GraphData {
  accounts: Array<{
    id: number;
    account_number: string;
    account_type: string;
    balance: number;
    status: string;
  }>;
  devices: Array<{
    id: number;
    device_id: string;
    device_type: string;
    os: string | null;
    linked_account_numbers: string[];
  }>;
  transactions: Array<{
    id: number;
    transaction_id: string;
    from_account_number: string;
    to_account_number: string;
    amount: number;
    currency: string;
    status: string;
    initiated_at: string;
  }>;
  adjacency: Map<string, Set<string>>;
}

@Injectable()
export class GraphService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  buildGraph(customerId: string): GraphData | null {
    const customer = this.db.prepare(
      `SELECT id FROM customers WHERE customer_code = ?`
    ).get(customerId) as { id: number } | undefined;

    if (!customer) return null;

    const accounts = this.db.prepare(
      `SELECT id, account_number, account_type, balance, status
       FROM accounts WHERE customer_id = ?`
    ).all(customer.id) as GraphData['accounts'];

    const accountIds = accounts.map(a => a.id);
    const accountNumberById = new Map(accounts.map(a => [a.id, a.account_number]));

    let devices: GraphData['devices'] = [];
    if (accountIds.length > 0) {
      const placeholders = accountIds.map(() => '?').join(',');
      const deviceRows = this.db.prepare(
        `SELECT DISTINCT d.id, d.device_id, d.device_type, d.os, da.account_id
         FROM devices d
         JOIN device_accounts da ON da.device_id = d.id
         WHERE da.account_id IN (${placeholders})`
      ).all(...accountIds) as Array<{ id: number; device_id: string; device_type: string; os: string | null; account_id: number }>;

      const deviceMap = new Map<number, GraphData['devices'][0]>();
      for (const row of deviceRows) {
        let device = deviceMap.get(row.id);
        if (!device) {
          device = {
            id: row.id,
            device_id: row.device_id,
            device_type: row.device_type,
            os: row.os,
            linked_account_numbers: [],
          };
          deviceMap.set(row.id, device);
        }
        const acctNum = accountNumberById.get(row.account_id);
        if (acctNum) device.linked_account_numbers.push(acctNum);
      }
      devices = Array.from(deviceMap.values());
    }

    const transactions = this.db.prepare(
      `SELECT
         t.id, t.transaction_id, t.amount, t.currency, t.status, t.initiated_at,
         fa.account_number AS from_account_number,
         ta.account_number AS to_account_number
       FROM transactions t
       JOIN accounts fa ON fa.id = t.from_account_id
       JOIN accounts ta ON ta.id = t.to_account_id
       WHERE fa.customer_id = ? OR ta.customer_id = ?
       ORDER BY t.initiated_at ASC`
    ).all(customer.id, customer.id) as GraphData['transactions'];

    const adjacency = new Map<string, Set<string>>();
    for (const acct of accounts) {
      adjacency.set(acct.account_number, new Set());
    }
    for (const txn of transactions) {
      const fromSet = adjacency.get(txn.from_account_number);
      if (fromSet) fromSet.add(txn.to_account_number);
    }

    return { accounts, devices, transactions, adjacency };
  }

  detectCircularFlow(adjacency: Map<string, Set<string>>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      if (inStack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), node]);
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      inStack.add(node);
      path.push(node);

      const neighbors = adjacency.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          dfs(neighbor);
        }
      }

      path.pop();
      inStack.delete(node);
    };

    for (const node of adjacency.keys()) {
      dfs(node);
    }

    return cycles;
  }
}
