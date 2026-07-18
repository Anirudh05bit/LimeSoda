'use client';

import { useWidgetSDK, useTheme } from '@nitrostack/widgets';
import type { CreateCaseOutput, DraftSarOutput } from '../../types/tool-data.js';

export default function CaseDetail() {
  const { isReady, getToolOutput } = useWidgetSDK();
  const theme = useTheme();

  if (!isReady) {
    return <div style={{ padding: '24px', color: '#999' }}>Loading...</div>;
  }

  const data = getToolOutput<CreateCaseOutput & Partial<DraftSarOutput>>();

  if (!data) {
    return <div style={{ padding: '32px', textAlign: 'center', color: '#999' }}>No case data available.</div>;
  }

  const bg = theme === 'dark' ? '#0a0a0a' : '#ffffff';
  const fg = theme === 'dark' ? '#e0e0e0' : '#1a1a1a';
  const border = theme === 'dark' ? '#2a2a2a' : '#e0e0e0';
  const muted = '#999';

  const isDraftPendingReview =
    data.status === 'DRAFT_PENDING_REVIEW' && data.requiresSignOff === true;

  const sectionStyle = {
    padding: '16px 20px',
    borderBottom: `1px solid ${border}`,
  };

  const labelStyle = {
    fontSize: '12px',
    fontWeight: 600,
    color: muted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '4px',
  };

  const valueStyle = {
    fontSize: '15px',
    fontWeight: 500,
  };

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
      {/* DRAFT — PENDING REVIEW banner: persistent, non-dismissible, governance requirement */}
      {isDraftPendingReview && (
        <div
          style={{
            background: '#dc2626',
            color: '#ffffff',
            padding: '14px 20px',
            fontWeight: 700,
            fontSize: '15px',
            letterSpacing: '0.04em',
            textAlign: 'center',
            borderBottom: '2px solid #991b1b',
          }}
        >
          DRAFT — PENDING REVIEW
        </div>
      )}

      {/* Header */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{data.caseId}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: muted }}>
              Alert {data.alertId}
            </p>
          </div>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              background:
                data.status === 'open' ? '#3b82f620' :
                data.status === 'investigating' ? '#f59e0b20' :
                data.status === 'escalated' ? '#ef444420' : '#6b728020',
              color:
                data.status === 'open' ? '#3b82f6' :
                data.status === 'investigating' ? '#f59e0b' :
                data.status === 'escalated' ? '#ef4444' : '#6b7280',
            }}
          >
            {data.status}
          </span>
        </div>
      </div>

      {/* Priority */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Priority</div>
        <div style={valueStyle}>{data.priority}</div>
      </div>

      {/* Evidence link */}
      {data.evidence && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Evidence</div>
          <div style={{ fontSize: '14px', color: muted }}>
            {data.evidence.uri}
          </div>
        </div>
      )}

      {/* Narrative (from draft_sar if present) */}
      {data.narrative && (
        <div style={{ ...sectionStyle, borderBottom: 'none' }}>
          <div style={labelStyle}>Narrative</div>
          <pre
            style={{
              fontSize: '13px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: '8px 0 0',
              padding: '16px',
              background: theme === 'dark' ? '#141414' : '#f5f5f5',
              borderRadius: '8px',
              border: `1px solid ${border}`,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {data.narrative}
          </pre>
        </div>
      )}
    </div>
  );
}
