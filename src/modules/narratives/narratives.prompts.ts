import { PromptDecorator as Prompt, ExecutionContext } from '@nitrostack/core';
import { CaseService } from '../cases/cases.service.js';

export class NarrativesPrompts {
  constructor(private caseService: CaseService) {}

  @Prompt({
    name: 'summarize_case',
    title: 'Summarize Case',
    description:
      'Pull case evidence and generate a structured investigation summary covering alert trigger, key relationships, transaction patterns, and a recommended next step.',
    arguments: [
      {
        name: 'case_id',
        description: 'Case ID to summarize, e.g. CASE-001',
        required: true,
      },
    ],
  })
  async summarizeCase(
    args: { case_id: string },
    context: ExecutionContext
  ) {
    const evidence = this.caseService.getCaseEvidence(args.case_id);
    if (!evidence) {
      throw new Error(`Case not found: ${args.case_id}`);
    }

    const evidenceJson = JSON.stringify(evidence, null, 2);

    return [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a financial crime investigator reviewing the following case evidence. Produce a structured summary with the following sections:

## Alert Trigger / Typology
Identify the alert type, severity, and what suspicious pattern it indicates.

## Key Relationships
Map the customer, their accounts, and any shared devices or counterparties.

## Notable Transaction Patterns
Highlight any circular flows, unusual volumes, rapid movement, or structuring indicators.

## Recommended Next Step
Suggest one concrete investigative action. This is NOT a final decision — it is a recommendation for human review only.

---

Case Evidence:
${evidenceJson}`,
        },
      },
    ];
  }

  @Prompt({
    name: 'draft_escalation_note',
    title: 'Draft Escalation Note',
    description:
      'Pull case evidence and draft a formal escalation note for compliance review, including finding summary, risk assessment, and recommended action.',
    arguments: [
      {
        name: 'case_id',
        description: 'Case ID to draft escalation for, e.g. CASE-001',
        required: true,
      },
    ],
  })
  async draftEscalationNote(
    args: { case_id: string },
    context: ExecutionContext
  ) {
    const evidence = this.caseService.getCaseEvidence(args.case_id);
    if (!evidence) {
      throw new Error(`Case not found: ${args.case_id}`);
    }

    const evidenceJson = JSON.stringify(evidence, null, 2)

    return [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are drafting an escalation note for a compliance officer reviewing case ${args.case_id}. Using the evidence below, produce a formal escalation note with:

## Case Overview
Case ID, alert type, severity, customer details, and current status.

## Finding Summary
What the investigation has uncovered — transaction patterns, entity relationships, and risk indicators.

## Risk Assessment
Assess the likelihood and impact based on the evidence. Cite specific data points.

## Recommended Action
State the recommended escalation path (close, request更多信息, or escalate toward SAR/STR drafting).

## Disclaimer
End your note with the exact line:
"This is a draft recommendation requiring compliance officer sign-off."

---

Case Evidence:
${evidenceJson}`,
        },
      },
    ];
  }
}
