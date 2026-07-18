import { ToolDecorator as Tool, UseMiddleware, Injectable, z, ExecutionContext } from '@nitrostack/core';
import { AlertService } from './alerts.service.js';
import { AuditLogMiddleware } from '../../middleware/audit-log.middleware.js';
import type { ResourceLink } from '@nitrostack/core';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

@Injectable({ deps: [AlertService] })
export class AlertsTools {
  constructor(private alertService: AlertService) {}

  @Tool({
    name: 'ingest_alert',
    title: 'Ingest Alert',
    description:
      'Create a new fraud/AML alert for a customer. Returns the generated alert record.',
    inputSchema: z.object({
      customerId: z
        .string()
        .describe('Customer code, e.g. CUST-001'),
      alertType: z
        .enum(['velocity', 'structuring', 'geo_anomaly', 'fund_dispersal'])
        .describe('Type of suspicious activity detected'),
      severity: z
        .enum(['low', 'medium', 'high'])
        .describe('Alert severity level'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async ingestAlert(
    input: {
      customerId: string;
      alertType: 'velocity' | 'structuring' | 'geo_anomaly' | 'fund_dispersal';
      severity: 'low' | 'medium' | 'high';
    },
    context: ExecutionContext
  ) {
    return this.alertService.createAlert(input);
  }

  @Tool({
    name: 'create_case',
    title: 'Create Case from Alert',
    description:
      'Open an investigation case linked to an existing alert. Returns the new case metadata and a resource_link to the full evidence bundle.',
    inputSchema: z.object({
      alertId: z
        .string()
        .describe('Alert ID to escalate, e.g. ALT-001'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  @UseMiddleware(AuditLogMiddleware)
  async createCase(
    input: { alertId: string },
    context: ExecutionContext
  ) {
    const result = this.alertService.createCaseFromAlert(input.alertId);

    const evidence: ResourceLink = {
      type: 'resource_link',
      uri: `case://${result.caseId}/evidence`,
      name: 'Case Evidence',
      mimeType: 'application/json',
    };

    return {
      caseId: result.caseId,
      alertId: result.alertId,
      status: result.status,
      priority: result.priority,
      evidence,
    };
  }

  @Tool({
    name: 'send_slack_alert',
    title: 'Send Slack Alert',
    description:
      'Send a Slack notification for a high-risk fraud alert. Includes customer ID, transaction details, risk score, detection reason, and SAR summary. Requires SLACK_WEBHOOK_URL environment variable.',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
      transactionId: z.string().describe('Transaction ID, e.g. TXN-001'),
      riskScore: z.number().describe('Risk score (0-100)'),
      detectionReason: z.string().describe('Reason for the alert/fraud detection'),
      sarSummary: z.string().describe('Summary of the Suspicious Activity Report'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async sendSlackAlert(
    input: {
      customerId: string;
      transactionId: string;
      riskScore: number;
      detectionReason: string;
      sarSummary: string;
    },
    context: ExecutionContext
  ) {
    if (!SLACK_WEBHOOK_URL) {
      return {
        status: 'skipped',
        message: 'Slack webhook URL not configured (set SLACK_WEBHOOK_URL env var)',
      };
    }

    const blocks = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🚨 High Risk Fraud Alert' },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Customer:*\n${input.customerId}` },
            { type: 'mrkdwn', text: `*Transaction:*\n${input.transactionId}` },
            { type: 'mrkdwn', text: `*Risk Score:*\n${input.riskScore}/100` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Detection Reason:*\n${input.detectionReason}` },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*SAR Summary:*\n${input.sarSummary}` },
        },
      ],
    };

    try {
      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blocks),
      });

      if (!response.ok) {
        throw new Error(`Slack API returned ${response.status}`);
      }

      return {
        status: 'sent',
        message: 'Slack alert sent successfully',
      };
    } catch (error) {
      return {
        status: 'failed',
        message: `Failed to send Slack alert: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
