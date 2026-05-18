'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';

type Snapshot = {
  generatedAt?: string;
  sources?: {
    ga4?: unknown;
    profound?: unknown;
    gsc?: unknown;
  };
};

export default function DashboardClient({ userEmail, userName }: { userEmail: string; userName: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/snapshot');
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || `HTTP ${res.status}`);
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

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: 22 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }}>Workhuman Dashboard</h1>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            {snapshot?.generatedAt ? `Last refreshed: ${new Date(snapshot.generatedAt).toLocaleString()}` : 'Loading...'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
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
            }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh data'}
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{userName} ({userEmail})</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{
              padding: '8px 12px',
              background: 'var(--surface)',
              color: 'var(--text-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '12px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && !snapshot && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          Loading snapshot...
        </div>
      )}

      {snapshot && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, boxShadow: 'var(--shadow)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>Snapshot loaded</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
            v1 scaffold — full tab UI ports next. Sources present:
          </p>
          <ul style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, paddingLeft: 20 }}>
            <li>GA4: {snapshot.sources?.ga4 ? '✓' : '✗ missing'}</li>
            <li>Profound: {snapshot.sources?.profound ? '✓' : '✗ missing'}</li>
            <li>GSC: {snapshot.sources?.gsc ? '✓' : '✗ missing'}</li>
          </ul>
          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>Raw snapshot (debug)</summary>
            <pre style={{ background: '#f6f8fb', padding: 12, borderRadius: 8, fontSize: 11, overflow: 'auto', maxHeight: 400, marginTop: 8 }}>
              {JSON.stringify(snapshot, null, 2).slice(0, 5000)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
