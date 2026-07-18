import { ToolDecorator as Tool, Injectable, z, ExecutionContext } from '@nitrostack/core';
import { DetectionService } from './detection.service.js';

@Injectable({ deps: [DetectionService] })
export class DetectionTools {
  constructor(private detectionService: DetectionService) {}

  @Tool({
    name: 'calculate_zscore',
    title: 'Calculate Z-Score',
    description:
      'Perform statistical anomaly detection on transaction amounts using z-score analysis. Transactions with |z| > 2 are flagged as anomalous.',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async calculateZscore(input: { customerId: string }, context: ExecutionContext) {
    const results = this.detectionService.calculateZScore(input.customerId);
    const anomalous = results.filter(r => r.anomalous);

    return {
      customerId: input.customerId,
      totalTransactions: results.length,
      anomalousTransactions: anomalous.length,
      results,
      summary: anomalous.length > 0
        ? `Found ${anomalous.length} transaction(s) with anomalous amounts (|z| > 2)`
        : 'No statistically anomalous transactions detected',
    };
  }

  @Tool({
    name: 'check_velocity',
    title: 'Check Velocity',
    description:
      'Analyze transaction frequency and volume within a configurable time window. Flags accounts where transaction count exceeds threshold.',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
      windowHours: z.number().optional().describe('Time window in hours (default 24)'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async checkVelocity(input: { customerId: string; windowHours?: number }, context: ExecutionContext) {
    const result = this.detectionService.checkVelocity(input.customerId, input.windowHours ?? 24);

    return {
      customerId: input.customerId,
      ...result,
      risk: result.flagged ? 'HIGH' : 'LOW',
    };
  }

  @Tool({
    name: 'geo_check',
    title: 'Geo Check',
    description:
      'Detect impossible travel patterns by analyzing consecutive transaction locations and calculating travel speed between them. Flags speeds exceeding 900 km/h (commercial flight speed).',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async geoCheck(input: { customerId: string }, context: ExecutionContext) {
    const results = this.detectionService.geoCheck(input.customerId);
    const impossible = results.filter(r => r.impossibleTravel);

    return {
      customerId: input.customerId,
      geoAnomalies: results.length,
      impossibleTravelEvents: impossible.length,
      results,
      summary: impossible.length > 0
        ? `Detected ${impossible.length} impossible travel event(s)`
        : results.length > 0
          ? `Found ${results.length} geographic anomalies (but none impossible)`
          : 'No geographic anomalies detected',
    };
  }

  @Tool({
    name: 'detect_structuring',
    title: 'Detect Structuring',
    description:
      'Identify structuring patterns where multiple transactions are kept below a reporting threshold (default $10,000). Flags accounts with 3+ below-threshold transactions.',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
      threshold: z.number().optional().describe('Reporting threshold in dollars (default 10000)'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async detectStructuring(input: { customerId: string; threshold?: number }, context: ExecutionContext) {
    const results = this.detectionService.detectStructuring(input.customerId, input.threshold ?? 10000);

    return {
      customerId: input.customerId,
      accountsFlagged: results.length,
      details: results,
      summary: results.length > 0
        ? `Detected structuring in ${results.length} account(s)`
        : 'No structuring patterns detected',
    };
  }

  @Tool({
    name: 'customer_history',
    title: 'Customer History',
    description:
      'Retrieve comprehensive customer history including profile, accounts, recent transactions, alert history, and linked devices. Used for holistic risk assessment.',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async customerHistory(input: { customerId: string }, context: ExecutionContext) {
    return this.detectionService.getCustomerHistory(input.customerId);
  }

  @Tool({
    name: 'build_transaction_graph',
    title: 'Build Transaction Graph',
    description:
      'Construct a complete transaction graph for a customer with nodes (accounts) and weighted edges (transactions). Returns graph in NetworkX-compatible format for visualization.',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async buildTransactionGraph(input: { customerId: string }, context: ExecutionContext) {
    return this.detectionService.buildTransactionGraph(input.customerId);
  }

  @Tool({
    name: 'detect_cycles',
    title: 'Detect Cycles',
    description:
      'Detect circular fund flows (A → B → ... → A) in the transaction graph using DFS cycle detection. Circular flows are a key indicator of money laundering layering.',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async detectCycles(input: { customerId: string }, context: ExecutionContext) {
    return this.detectionService.detectCycles(input.customerId);
  }
}
