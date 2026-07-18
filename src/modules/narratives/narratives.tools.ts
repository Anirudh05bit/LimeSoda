import { ToolDecorator as Tool, UseGuards, UseMiddleware, Injectable, z, ExecutionContext } from '@nitrostack/core';
import { CaseService } from '../cases/cases.service.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { AuditLogMiddleware } from '../../middleware/audit-log.middleware.js';

@Injectable({ deps: [CaseService] })
export class NarrativesTools {
  constructor(private caseService: CaseService) {}

  @Tool({
    name: 'draft_sar',
    title: 'Draft SAR Narrative',
    description:
      'Generate a draft Suspicious Activity Report narrative for a case. The output is always marked DRAFT_PENDING_REVIEW — it must be reviewed and approved by a compliance officer before any filing.',
    inputSchema: z.object({
      caseId: z
        .string()
        .describe('Case ID to draft SAR for, e.g. CASE-001'),
    }),
    outputSchema: z.object({
      status: z.literal('DRAFT_PENDING_REVIEW'),
      caseId: z.string(),
      narrative: z.string(),
      requiresSignOff: z.literal(true),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  @UseGuards(RoleGuard('compliance_officer'))
  @UseMiddleware(AuditLogMiddleware)
  async draftSar(
    input: { caseId: string },
    context: ExecutionContext
  ) {
    const evidence = this.caseService.getCaseEvidence(input.caseId);
    if (!evidence) {
      throw new Error(`Case not found: ${input.caseId}`);
    }

    const { case: caseData, alert, customer, accounts, transactions } = evidence;

    const txnSummary = transactions
      .map(
        (t: Record<string, unknown>) =>
          `  - ${t.transaction_id}: ${t.from_account} → ${t.to_account} ($${t.amount} ${t.currency}, ${t.status}, ${t.initiated_at})`
      )
      .join('\n');

    const narrative = [
      `SUSPICIOUS ACTIVITY REPORT — DRAFT`,
      ``,
      `Case ID: ${caseData.caseId}`,
      `Alert: ${alert.alertId} (${alert.alertType}, severity: ${alert.severity})`,
      `Customer: ${customer.customerCode} (${customer.name}, risk: ${customer.riskRating})`,
      ``,
      `ACCOUNTS INVOLVED:`,
      ...accounts.map(
        (a: Record<string, unknown>) =>
          `  - ${a.account_number} (${a.account_type}, balance: $${a.balance}, status: ${a.status})`
      ),
      ``,
      `TRANSACTION TIMELINE:`,
      txnSummary || '  (no transactions recorded)',
      ``,
      `FINDING:`,
      `Alert ${alert.alertId} was triggered for ${alert.alertType} activity involving customer ${customer.customerCode}. ` +
        `The transaction pattern shows fund movement across ${accounts.length} linked account(s) ` +
        `totaling $${transactions.reduce((sum: number, t: Record<string, unknown>) => sum + (t.amount as number), 0).toFixed(2)} in volume. ` +
        `${alert.description || ''}`,
      ``,
      `RECOMMENDED ACTION:`,
      `This case should be reviewed by a compliance officer for potential SAR/STR filing.`,
      ``,
      `---`,
      `DRAFT — This narrative requires compliance officer sign-off before any regulatory filing.`,
    ].join('\n');

    return {
      status: 'DRAFT_PENDING_REVIEW' as const,
      caseId: input.caseId,
      narrative,
      requiresSignOff: true as const,
    };
  }

  @Tool({
    name: 'generate_sar',
    title: 'Generate SAR',
    description:
      'Generate a concise Suspicious Activity Report based on detection findings, compliance analysis, and retrieved regulation snippets. Returns structured SAR with summary, details, and recommended action.',
    inputSchema: z.object({
      customerId: z.string().describe('Customer code, e.g. CUST-001'),
      detectionSummary: z.string().describe('Summary of detection findings from the Detection Agent'),
      complianceAnalysis: z.string().describe('Compliance analysis including relevant regulations'),
      riskScore: z.number().describe('Final risk score (0-100)'),
      riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Final risk level classification'),
      recommendedAction: z.enum(['APPROVE', 'REVIEW', 'BLOCK']).describe('Recommended action'),
      relevantRegulations: z.array(z.object({
        docId: z.string(),
        title: z.string(),
        excerpt: z.string(),
      })).optional().describe('Relevant regulation snippets retrieved from RAG'),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async generateSar(
    input: {
      customerId: string;
      detectionSummary: string;
      complianceAnalysis: string;
      riskScore: number;
      riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      recommendedAction: 'APPROVE' | 'REVIEW' | 'BLOCK';
      relevantRegulations?: Array<{ docId: string; title: string; excerpt: string }>;
    },
    context: ExecutionContext
  ) {
    const regSection = input.relevantRegulations && input.relevantRegulations.length > 0
      ? '\nRELEVANT REGULATIONS:\n' + input.relevantRegulations.map(r =>
          `  - ${r.title} (${r.docId}): ${r.excerpt}`
        ).join('\n')
      : '';

    const narrative = [
      `SUSPICIOUS ACTIVITY REPORT`,
      `========================`,
      ``,
      `Customer: ${input.customerId}`,
      `Risk Score: ${input.riskScore}/100 (${input.riskLevel})`,
      `Recommended Action: ${input.recommendedAction}`,
      ``,
      `DETECTION ANALYSIS:`,
      input.detectionSummary,
      ``,
      `COMPLIANCE ANALYSIS:`,
      input.complianceAnalysis,
      regSection,
      ``,
      `---`,
      `Generated by Fraud Sentinel — AI-assisted SAR`,
    ].join('\n');

    return {
      customerId: input.customerId,
      riskScore: input.riskScore,
      riskLevel: input.riskLevel,
      recommendedAction: input.recommendedAction,
      narrative,
      generatedAt: new Date().toISOString(),
    };
  }
}
