'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Snapshot, isErrorShape } from '@/lib/snapshot-types';
import { isoToFriendly } from '@/lib/format';
import { OverviewTab } from '@/components/tabs/OverviewTab';
import { TrafficTab } from '@/components/tabs/TrafficTab';
import { PaidTab } from '@/components/tabs/PaidTab';
import { AISearchTab } from '@/components/tabs/AISearchTab';
import { ContentTab } from '@/components/tabs/ContentTab';
import { WHLPTab } from '@/components/tabs/WHLPTab';

type TabKey = 'overview' | 'traffic' | 'paid' | 'ai' | 'content' | 'whlp';

const TABS: { key: TabKey; label: string; badge?: string; badgeKind?: 'alert' | 'new' }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'traffic', label: 'Web Traffic' },
  { key: 'paid', label: 'Paid Performance' },
  { key: 'ai', label: 'AI Search' },
  { key: 'content', label: 'Content', badge: 'drill-down', badgeKind: 'new' },
  { key: 'whlp', label: 'WHLP' },
];

export default function DashboardClient({ userEmail, userName }: { userEmail: string; userName: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/snapshot', { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Snapshot;
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || body.detail || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const tabContent = snapshot ? renderTab(tab, snapshot) : null;

  // Surface per-source errors as banner above the tabs.
  const sourceErrors: string[] = [];
  if (snapshot) {
    for (const [name, value] of Object.entries(snapshot.sources)) {
      if (isErrorShape(value)) sourceErrors.push(`${name}: ${value.error}`);
    }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: 22 }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Workhuman Dashboard
          </h1>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            workhuman.com (filtered) · rolling 30-day MoM
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {snapshot?.generatedAt && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 11px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                fontSize: 11.5,
                color: 'var(--text-2)',
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span style={{ color: 'var(--good)', fontSize: 10 }}>●</span>
              <span style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, fontWeight: 600 }}>Refreshed</span>
              <span>{isoToFriendly(snapshot.generatedAt)}</span>
            </span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              padding: '8px 14px',
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              opacity: refreshing ? 0.6 : 1,
              cursor: refreshing ? 'wait' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {userName} ({userEmail})
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{
              padding: '8px 12px',
              background: 'var(--surface)',
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div
        style={{
          display: 'flex',
          gap: 4,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 4,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 500,
              color: tab === t.key ? 'var(--text)' : 'var(--muted)',
              background: tab === t.key ? 'var(--surface)' : 'transparent',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: tab === t.key ? '0 1px 2px rgba(11,18,32,0.06)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
            {t.badge && (
              <span
                style={{
                  background: t.badgeKind === 'new' ? 'var(--emerald)' : 'var(--bad)',
                  color: '#fff',
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontWeight: 600,
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            padding: '12px 14px',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {sourceErrors.length > 0 && (
        <div
          style={{
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            color: 'var(--gold-deep)',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: 12,
          }}
        >
          <strong>One or more sources failed in the last refresh:</strong>
          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
            {sourceErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {loading && !snapshot && (
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 40,
            textAlign: 'center',
            color: 'var(--muted)',
          }}
        >
          Loading snapshot…
        </div>
      )}

      {tabContent}
    </div>
  );
}

function renderTab(tab: TabKey, snapshot: Snapshot): React.ReactNode {
  switch (tab) {
    case 'overview':
      return <OverviewTab snapshot={snapshot} />;
    case 'traffic':
      return <TrafficTab snapshot={snapshot} />;
    case 'paid':
      return <PaidTab snapshot={snapshot} />;
    case 'ai':
      return <AISearchTab snapshot={snapshot} />;
    case 'content':
      return <ContentTab snapshot={snapshot} />;
    case 'whlp':
      return <WHLPTab snapshot={snapshot} />;
  }
}
