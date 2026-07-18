import { ResourceDecorator as Resource, Injectable, ExecutionContext } from '@nitrostack/core';
import Database from 'better-sqlite3';
import { DB_PATH } from '../../database/db-path.js';
import { CaseService } from './cases.service.js';

@Injectable({ deps: [CaseService] })
export class CasesResources {
  private db: Database.Database;

  constructor(private caseService: CaseService) {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  private listCustomerCodes(): string[] {
    return (this.db.prepare('SELECT customer_code FROM customers ORDER BY customer_code').all() as { customer_code: string }[]).map(r => r.customer_code);
  }

  private listCaseIds(): string[] {
    return (this.db.prepare('SELECT case_id FROM cases ORDER BY case_id').all() as { case_id: string }[]).map(r => r.case_id);
  }

  private isTemplateParam(value: string): boolean {
    return /^\{.*\}$/.test(value);
  }

  private templateText(uri: string, paramName: string, examples: string[], exampleUri: string): string {
    return [
      `Resource Template: ${uri}`,
      ``,
      `This is a template resource. Replace ${paramName} with an actual value.`,
      ``,
      `Available values:`,
      ...examples.map(v => `  ${v}`),
      ``,
      `Example: ${exampleUri}`,
    ].join('\n');
  }

  @Resource({
    uri: 'customer://{customerId}/profile',
    name: 'Customer Profile',
    description: 'Full customer profile including accounts, devices, and risk rating',
    mimeType: 'application/json',
    annotations: {
      audience: ['assistant'],
      priority: 0.9,
    },
  })
  async getCustomerProfile(uri: string, context: ExecutionContext) {
    const match = uri.match(/customer:\/\/([^/]+)\/profile/);
    if (!match) {
      throw new Error(`Invalid customer profile URI: ${uri}`);
    }
    const customerId = match[1];
    if (this.isTemplateParam(customerId)) {
      const codes = this.listCustomerCodes();
      return { contents: [{ uri, mimeType: 'text/plain', text: this.templateText(uri, '{customerId}', codes, `customer://${codes[0] || 'CUST-001'}/profile`) }] };
    }

    const profile = this.caseService.getCustomerProfile(customerId);
    if (!profile) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(profile, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'customer://{customerId}/timeline',
    name: 'Transaction Timeline',
    description: 'Chronological transaction history for all accounts belonging to a customer',
    mimeType: 'application/json',
    annotations: {
      audience: ['assistant'],
      priority: 0.8,
    },
  })
  async getTransactionTimeline(uri: string, context: ExecutionContext) {
    const match = uri.match(/customer:\/\/([^/]+)\/timeline/);
    if (!match) {
      throw new Error(`Invalid transaction timeline URI: ${uri}`);
    }
    const customerId = match[1];
    if (this.isTemplateParam(customerId)) {
      const codes = this.listCustomerCodes();
      return { contents: [{ uri, mimeType: 'text/plain', text: this.templateText(uri, '{customerId}', codes, `customer://${codes[0] || 'CUST-001'}/timeline`) }] };
    }

    const timeline = this.caseService.getTransactionTimeline(customerId);
    if (!timeline) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(timeline, null, 2),
      }],
    };
  }

  @Resource({
    uri: 'case://{caseId}/evidence',
    name: 'Case Evidence',
    description: 'Consolidated evidence bundle for a case: alert details, customer profile, accounts, and linked transactions',
    mimeType: 'application/json',
    annotations: {
      audience: ['assistant'],
      priority: 1.0,
    },
  })
  async getCaseEvidence(uri: string, context: ExecutionContext) {
    const match = uri.match(/case:\/\/([^/]+)\/evidence/);
    if (!match) {
      throw new Error(`Invalid case evidence URI: ${uri}`);
    }
    const caseId = match[1];
    if (this.isTemplateParam(caseId)) {
      const ids = this.listCaseIds();
      return { contents: [{ uri, mimeType: 'text/plain', text: this.templateText(uri, '{caseId}', ids, `case://${ids[0] || 'CASE-001'}/evidence`) }] };
    }

    const evidence = this.caseService.getCaseEvidence(caseId);
    if (!evidence) {
      throw new Error(`Case not found: ${caseId}`);
    }

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(evidence, null, 2),
      }],
    };
  }
}
