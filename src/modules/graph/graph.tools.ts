/**
 * Graph Analysis Tools
 *
 * These tools use RULE-BASED and GRAPH-THEORETIC techniques only — standard
 * adjacency traversal, cycle detection via DFS, and weighted scoring. They are
 * NOT machine-learned fraud detection models. Any flagged pattern is a
 * structural signal that requires analyst review before any conclusion is drawn.
 */

import { ToolDecorator as Tool, UseGuards, Injectable, z, ExecutionContext } from '@nitrostack/core';
import { GraphService } from './graph.service.js';
import { RoleGuard } from '../../guards/role.guard.js';

@Injectable({ deps: [GraphService] })
export class GraphTools {
  constructor(private graphService: GraphService) {}

  @Tool({
    name: 'expand_entity_graph',
    title: 'Expand Entity Graph',
    description:
      'Build the full entity graph for a customer — accounts, devices, and transactions — and return node/edge counts plus adjacency data.',
    inputSchema: z.object({
      customerId: z
        .string()
        .describe('Customer code, e.g. CUST-001'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async expandEntityGraph(
    input: { customerId: string },
    context: ExecutionContext
  ) {
    const graph = this.graphService.buildGraph(input.customerId);
    if (!graph) {
      throw new Error(`Customer not found: ${input.customerId}`);
    }

    const nodeCount =
      graph.accounts.length + graph.devices.length;
    let edgeCount = graph.transactions.length;
    for (const neighbors of graph.adjacency.values()) {
      edgeCount += neighbors.size;
    }

    return {
      customerId: input.customerId,
      nodeCount,
      edgeCount,
      accounts: graph.accounts,
      devices: graph.devices,
      transactions: graph.transactions,
    };
  }

  @Tool({
    name: 'flag_layering_pattern',
    title: 'Flag Layering Pattern',
    description:
      'Detect circular fund flows (A → B → … → A) for a customer using DFS cycle detection. Returns flagged status and any cycles found.',
    inputSchema: z.object({
      customerId: z
        .string()
        .describe('Customer code, e.g. CUST-001'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  @UseGuards(RoleGuard('l2_investigator'))
  async flagLayeringPattern(
    input: { customerId: string },
    context: ExecutionContext
  ) {
    const graph = this.graphService.buildGraph(input.customerId);
    if (!graph) {
      throw new Error(`Customer not found: ${input.customerId}`);
    }

    const cycles = this.graphService.detectCircularFlow(graph.adjacency);

    return {
      customerId: input.customerId,
      flagged: cycles.length > 0,
      patternType: cycles.length > 0 ? 'circular_flow' : 'none',
      cycles,
      note:
        'Rule-based structural flag only — requires analyst review before any conclusion.',
    };
  }

  @Tool({
    name: 'score_alert',
    title: 'Score Alert',
    description:
      'Produce a weighted risk score combining alert severity, transaction volume, and circular flow detection. Returns the score plus a component breakdown.',
    inputSchema: z.object({
      customerId: z
        .string()
        .describe('Customer code, e.g. CUST-001'),
      alertSeverity: z
        .enum(['low', 'medium', 'high'])
        .describe('Severity of the alert being scored'),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async scoreAlert(
    input: { customerId: string; alertSeverity: 'low' | 'medium' | 'high' },
    context: ExecutionContext
  ) {
    const graph = this.graphService.buildGraph(input.customerId);
    if (!graph) {
      throw new Error(`Customer not found: ${input.customerId}`);
    }

    const severityWeight: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 3,
    };
    const severityScore = severityWeight[input.alertSeverity] ?? 1;

    const txnVolume = graph.transactions.reduce((sum, t) => sum + t.amount, 0);
    const volumeScore = Math.min(5, Math.floor(txnVolume / 10000));

    const cycles = this.graphService.detectCircularFlow(graph.adjacency);
    const cycleScore = Math.min(5, cycles.length * 2);

    const raw = severityScore + volumeScore + cycleScore;
    const maxPossible = 3 + 5 + 5;
    const normalized = Math.round((raw / maxPossible) * 100);

    return {
      customerId: input.customerId,
      score: normalized,
      breakdown: {
        severity: { value: input.alertSeverity, weight: severityScore },
        transactionVolume: {
          totalAmount: txnVolume,
          weight: volumeScore,
        },
        circularFlow: {
          cyclesDetected: cycles.length,
          weight: cycleScore,
        },
      },
      maxPossible,
    };
  }
}
