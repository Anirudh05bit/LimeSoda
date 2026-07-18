import { ToolDecorator as Tool, UseMiddleware, Injectable, z, ExecutionContext } from '@nitrostack/core';
import { AlertService } from './alerts.service.js';
import { AuditLogMiddleware } from '../../middleware/audit-log.middleware.js';
import type { ResourceLink } from '@nitrostack/core';

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
}
