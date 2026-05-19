'use client';

import { useEffect, useState } from 'react';
import { Card, SectionTitle } from '@/components/shared/Card';
import { LineSeries, PALETTE } from '@/components/shared/Charts';
import { fmt } from '@/lib/format';

type Trace = {
  date: string;
  ga4Sessions?: number;
  ga4Users?: number;
  gscClicks?: number;
  gscImpressions?: number;
  profoundCitations?: number;
  paidCost?: number;
};

type HistoryResponse = {
  days: number;
  snapshots: number;
  traces: Trace[];
};

/**
 * 30/60/90 trend comparison card. Activates as historical snapshots
 * accumulate in Blob. Until then it shows a placeholder explaining what's
 * coming.
 */
export function TrendCompareCard() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [days, setDays] = useState<30 | 60 | 90>(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/history?days=${days}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { snapshots: 0, traces: [] }))
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <Card title="Trend comparison" accent="purple">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Window
        </span>
        {([30, 60, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: '5px 11px',
              background: days === d ? 'var(--text)' : 'var(--surface)',
              color: days === d ? '#fff' : 'var(--text-2)',
              border: `1px solid ${days === d ? 'var(--text)' : 'var(--border)'}`,
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {d}d
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {data ? `${data.snapshots} archived snapshot${data.snapshots === 1 ? '' : 's'} available` : ''}
        </span>
      </div>

      {loading && <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Loading history…</div>}

      {!loading && data && data.snapshots < 2 && (
        <div
          style={{
            padding: '16px 18px',
            background: 'var(--surface-2)',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            fontSize: 13,
            color: 'var(--text-2)',
            lineHeight: 1.5,
          }}
        >
          <strong>Historical trend will populate as the daily 6am ET cron runs.</strong>
          <br />
          Today is day 1. Tomorrow's cron writes another. By mid-June we&apos;ll have a meaningful 30-day series here. Until then, this card is a placeholder.
        </div>
      )}

      {!loading && data && data.snapshots >= 2 && (
        <TrendCharts traces={data.traces} />
      )}
    </Card>
  );
}

function TrendCharts({ traces }: { traces: Trace[] }) {
  const labels = traces.map((t) => t.date.slice(5)); // MM-DD
  const seriesGroups: Array<{ title: string; series: { name: string; data: number[]; color: string }[] }> = [
    {
      title: 'GA4 sessions & users',
      series: [
        { name: 'Sessions', data: traces.map((t) => t.ga4Sessions ?? 0), color: PALETTE.primary },
        { name: 'Users', data: traces.map((t) => t.ga4Users ?? 0), color: PALETTE.emerald },
      ],
    },
    {
      title: 'GSC clicks',
      series: [{ name: 'Clicks', data: traces.map((t) => t.gscClicks ?? 0), color: PALETTE.emerald }],
    },
    {
      title: 'Profound — Workhuman citations',
      series: [{ name: 'Citations', data: traces.map((t) => t.profoundCitations ?? 0), color: PALETTE.purple }],
    },
    {
      title: 'Paid spend',
      series: [{ name: 'Spend', data: traces.map((t) => t.paidCost ?? 0), color: PALETTE.gold }],
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
      {seriesGroups.map((g, i) => (
        <div key={i}>
          <SectionTitle>{g.title}</SectionTitle>
          <LineSeries
            labels={labels}
            series={g.series}
            height={160}
            yFormatter={(n) => fmt(n)}
          />
        </div>
      ))}
    </div>
  );
}
