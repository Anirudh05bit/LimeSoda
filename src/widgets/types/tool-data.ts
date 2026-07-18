/**
 * Widget prop types — mirrors tool output shapes.
 *
 * Replace this file with the output of `nitrostack-cli generate types`
 * once the CLI is available. The shapes below match the current tool
 * return types so widgets compile without hand-written duplicates.
 */

export interface CreateCaseOutput {
  caseId: string;
  alertId: string;
  status: 'open' | 'investigating' | 'escalated' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  evidence: {
    type: 'resource_link';
    uri: string;
    name: string;
    mimeType: string;
  };
}

export interface ExpandEntityGraphOutput {
  customerId: string;
  nodeCount: number;
  edgeCount: number;
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
}

export interface DraftSarOutput {
  status: 'DRAFT_PENDING_REVIEW';
  caseId: string;
  narrative: string;
  requiresSignOff: true;
}

export interface CaseEvidenceOutput {
  case: {
    caseId: string;
    title: string;
    status: string;
    priority: string;
    assignedTo: string | null;
    createdAt: string;
    updatedAt: string;
  };
  alert: {
    alertId: string;
    alertType: string;
    severity: string;
    status: string;
    description: string | null;
    detectedAt: string;
  };
  customer: {
    customerCode: string;
    name: string;
    riskRating: string;
  };
  accounts: Array<{
    account_number: string;
    account_type: string;
    balance: number;
    status: string;
  }>;
  transactions: Array<{
    transaction_id: string;
    amount: number;
    currency: string;
    status: string;
    initiated_at: string;
    completed_at: string | null;
    from_account: string;
    to_account: string;
  }>;
}
