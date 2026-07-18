import { ResourceDecorator as Resource, ExecutionContext } from '@nitrostack/core';
import { CaseService } from './cases.service.js';

export class CasesResources {
  constructor(private caseService: CaseService) {}

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
