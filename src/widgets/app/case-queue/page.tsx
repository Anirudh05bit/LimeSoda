'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

interface CaseRow {
  caseId: string;
  title: string;
  alertType: string;
  severity: string;
  status: string;
  priority: string;
  createdAt: string;
}

interface CaseQueueData {
  cases: CaseRow[];
}

export default function CaseQueue() {
  const { isReady, getToolOutput } = useWidgetSDK();
  const theme = useTheme();

  if (!isReady) {
    return <div style={{ padding: '24px', color: '#999' }}>Loading...</div>;
  }

  const data = getToolOutput<CaseQueueData>();

  const bg = theme === 'dark' ? '#0a0a0a' : '#ffffff';
  const fg = theme === 'dark' ? '#e0e0e0' : '#1a1a1a';
  const border = theme === 'dark' ? '#2a2a2a' : '#e0e0e0';
  const headerBg = theme === 'dark' ? '#1a1a1a' : '#f5f5f5';
  const rowHover = theme === 'dark' ? '#141414' : '#fafafa';

  const severityColor: Record<string, string> = {
    low: '#22c55e',
    medium: '#eab308',
    high: '#ef4444',
    critical: '#dc2626',
  };

  const statusColor: Record<string, string> = {
    open: '#3b82f6',
    investigating: '#f59e0b',
    escalated: '#ef4444',
    closed: '#6b7280',
  };

  const cases = data?.cases ?? [];

  if (cases.length === 0) {
    return (
      <div style={{ padding: '32px', background: bg, color: fg, borderRadius: '12px', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: '#999' }}>No open cases.</p>
      </div>
    );
  }

  return (
    <div style={{ background: bg, color: fg, borderRadius: '12px', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, background: headerBg }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Case Queue</h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#999' }}>{cases.length} case(s)</p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${border}` }}>
            {['Case ID', 'Alert Type', 'Severity', 'Status', 'Priority', 'Created'].map((h) => (
              <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#999', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.caseId} style={{ borderBottom: `1px solid ${border}` }}>
              <td style={{ padding: '12px 16px', fontWeight: 600 }}>{c.caseId}</td>
              <td style={{ padding: '12px 16px' }}>{c.alertType.replace(/_/g, ' ')}</td>
              <td style={{ padding: '12px 16px' }}>
                <span style={{ color: severityColor[c.severity] ?? fg, fontWeight: 500 }}>
                  {c.severity}
                </span>
              </td>
              <td style={{ padding: '12px 16px' }}>
                <span style={{ color: statusColor[c.status] ?? fg, fontWeight: 500 }}>
                  {c.status}
                </span>
              </td>
              <td style={{ padding: '12px 16px' }}>{c.priority}</td>
              <td style={{ padding: '12px 16px', color: '#999' }}>{c.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
