'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';
import type { ExpandEntityGraphOutput } from '../../types/tool-data.js';

export default function GraphView() {
  const { isReady, getToolOutput } = useWidgetSDK();
  const theme = useTheme();

  if (!isReady) {
    return <div style={{ padding: '24px', color: '#999' }}>Loading...</div>;
  }

  const data = getToolOutput<ExpandEntityGraphOutput>();

  const bg = theme === 'dark' ? '#0a0a0a' : '#ffffff';
  const fg = theme === 'dark' ? '#e0e0e0' : '#1a1a1a';
  const border = theme === 'dark' ? '#2a2a2a' : '#e0e0e0';
  const headerBg = theme === 'dark' ? '#1a1a1a' : '#f5f5f5';
  const muted = '#999';

  const transactions = data?.transactions ?? [];

  return (
    <div
      style={{
        background: bg,
        color: fg,
        borderRadius: '12px',
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header with summary stats */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${border}`, background: headerBg }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Entity Graph</h2>
        {data && (
          <div style={{ display: 'flex', gap: '24px', marginTop: '8px', fontSize: '13px', color: muted }}>
            <span>{data.nodeCount} nodes</span>
            <span>{data.edgeCount} edges</span>
            <span>{transactions.length} transactions</span>
          </div>
        )}
      </div>

      {/* Transactions table */}
      {transactions.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: muted }}>
          No transactions to display.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${border}` }}>
              {['Transaction', 'From', 'To', 'Amount', 'Status', 'Date'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: muted,
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.transaction_id} style={{ borderBottom: `1px solid ${border}` }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{t.transaction_id}</td>
                <td style={{ padding: '12px 16px' }}>{t.from_account_number}</td>
                <td style={{ padding: '12px 16px' }}>{t.to_account_number}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                  ${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span
                    style={{
                      color:
                        t.status === 'completed' ? '#22c55e' :
                        t.status === 'flagged' ? '#ef4444' :
                        t.status === 'pending' ? '#f59e0b' : muted,
                    }}
                  >
                    {t.status}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: muted, fontSize: '13px' }}>
                  {t.initiated_at}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
