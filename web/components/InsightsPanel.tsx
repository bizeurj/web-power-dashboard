'use client';

import { useEffect, useState } from 'react';
import { Snapshot } from '@/lib/snapshot-types';
import type { TabKey } from './DashboardClient';

type Observation = {
  headline: string;
  detail: string;
  severity: 'good' | 'warn' | 'info' | 'bad';
  metric?: string;
};

type InsightsResponse = {
  generatedAt: string;
  summary: string;
  observations: Observation[];
};

export function InsightsPanel({ snapshot, tab }: { snapshot: Snapshot; tab: TabKey }) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/insights?tab=${tab}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.detail || b.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setData(d as InsightsResponse);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, snapshot.generatedAt]);

  if (error && error.includes('ANTHROPIC_API_KEY')) {
    // Soft hide if not configured. Don't nag.
    return null;
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SparkIcon />
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--purple-deep)' }}>
            What stands out
          </span>
          {loading && <span style={{ fontSize: 11, color: 'var(--muted)' }}>analyzing…</span>}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            fontSize: 11,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <>
          {error && (
            <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>
              Insights unavailable: {error}
            </div>
          )}
          {data && (
            <>
              {data.summary && (
                <div style={summaryStyle}>{data.summary}</div>
              )}
              <div style={obsListStyle}>
                {data.observations?.map((obs, i) => (
                  <ObservationCard key={i} obs={obs} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ObservationCard({ obs }: { obs: Observation }) {
  const palette: Record<Observation['severity'], { bg: string; border: string; chip: string; chipBg: string }> = {
    good: { bg: '#f0fdf4', border: '#86efac', chip: 'var(--good)', chipBg: 'var(--good-soft)' },
    warn: { bg: '#fffbeb', border: '#fcd34d', chip: 'var(--gold-deep)', chipBg: 'var(--gold-soft)' },
    info: { bg: '#eff6ff', border: '#bfdbfe', chip: 'var(--primary-deep)', chipBg: 'var(--primary-soft)' },
    bad: { bg: '#fef2f2', border: '#fca5a5', chip: 'var(--bad)', chipBg: 'var(--bad-soft)' },
  };
  const p = palette[obs.severity] || palette.info;
  return (
    <div
      style={{
        flex: '1 1 280px',
        minWidth: 0,
        padding: '12px 14px',
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {obs.metric && (
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              background: p.chipBg,
              color: p.chip,
            }}
          >
            {obs.metric}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 4 }}>
        {obs.headline}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{obs.detail}</div>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--purple)' }}>
      <path d="M5 3v4M3 5h4M19 7v4M17 9h4M11 13l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
    </svg>
  );
}

const containerStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #fafbff 0%, #f5f0ff 100%)',
  border: '1px solid #e9d5ff',
  borderRadius: 12,
  padding: '14px 18px',
  marginBottom: 18,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
};

const summaryStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text)',
  fontWeight: 500,
  lineHeight: 1.5,
  marginBottom: 12,
};

const obsListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
};
