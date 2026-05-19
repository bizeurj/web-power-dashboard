'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function DebugClient() {
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'tree' | 'raw'>('tree');

  useEffect(() => {
    fetch('/api/snapshot', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : r.json().then((j) => { throw new Error(j.error || `HTTP ${r.status}`); }))
      .then(setSnapshot)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: 22 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Snapshot debug</h1>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
            Live data shape from /api/snapshot. Use this to diagnose missing tabs / zero values.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard" style={btnSecondary}>← Dashboard</Link>
          <button onClick={() => setView(view === 'tree' ? 'raw' : 'tree')} style={btnPrimary}>
            {view === 'tree' ? 'Show raw JSON' : 'Show key tree'}
          </button>
        </div>
      </header>

      {error && (
        <div style={errorBox}>{error}</div>
      )}

      {!snapshot && !error && (
        <div style={{ color: 'var(--muted)', padding: 40, textAlign: 'center' }}>Loading…</div>
      )}

      {snapshot && view === 'tree' && <TreeView data={snapshot} />}

      {snapshot && view === 'raw' && (
        <pre style={preBox}>{JSON.stringify(snapshot, null, 2)}</pre>
      )}
    </div>
  );
}

function TreeView({ data, prefix = '$' }: { data: unknown; prefix?: string }) {
  if (data === null || data === undefined) {
    return <Row label={prefix} value={String(data)} kind="null" />;
  }
  if (Array.isArray(data)) {
    const sample = data[0];
    const sampleShape = sample !== undefined ? describeShape(sample) : '(empty)';
    return (
      <details style={detailsStyle} open={prefix === '$'}>
        <summary style={summaryStyle}>
          <span style={{ color: 'var(--primary)' }}>{prefix}</span>
          <span style={{ color: 'var(--muted)' }}> [array, length={data.length}{sample !== undefined && `, sample=${sampleShape}`}]</span>
        </summary>
        <div style={{ marginLeft: 18, marginTop: 4 }}>
          {data.slice(0, 3).map((item, i) => (
            <TreeView key={i} data={item} prefix={`[${i}]`} />
          ))}
          {data.length > 3 && (
            <Row label={`...${data.length - 3} more`} value="" kind="muted" />
          )}
        </div>
      </details>
    );
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    return (
      <details style={detailsStyle} open={prefix === '$' || prefix === '$.sources'}>
        <summary style={summaryStyle}>
          <span style={{ color: 'var(--primary)' }}>{prefix}</span>
          <span style={{ color: 'var(--muted)' }}> {`{${keys.length} keys}`}</span>
        </summary>
        <div style={{ marginLeft: 18, marginTop: 4 }}>
          {keys.map((k) => (
            <TreeView key={k} data={obj[k]} prefix={k} />
          ))}
        </div>
      </details>
    );
  }
  return <Row label={prefix} value={String(data)} kind={typeof data === 'number' ? 'num' : 'str'} />;
}

function describeShape(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === 'object') return `{${Object.keys(v as object).slice(0, 4).join(', ')}…}`;
  return typeof v;
}

function Row({ label, value, kind }: { label: string; value: string; kind: 'null' | 'num' | 'str' | 'muted' }) {
  const colors: Record<string, string> = {
    null: 'var(--muted)',
    num: 'var(--gold-deep)',
    str: 'var(--emerald)',
    muted: 'var(--muted)',
  };
  const truncated = value.length > 120 ? value.slice(0, 117) + '…' : value;
  return (
    <div style={{ padding: '2px 0', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12 }}>
      <span style={{ color: 'var(--primary)' }}>{label}</span>
      <span style={{ color: 'var(--muted)' }}>: </span>
      <span style={{ color: colors[kind] }}>{truncated}</span>
    </div>
  );
}

const detailsStyle: React.CSSProperties = {
  padding: '2px 0',
};

const summaryStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace,Menlo,monospace',
  fontSize: 12,
  cursor: 'pointer',
  userSelect: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '7px 14px',
  background: 'var(--text)',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 500,
};

const btnSecondary: React.CSSProperties = {
  padding: '7px 14px',
  background: 'var(--surface)',
  color: 'var(--text-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-block',
};

const errorBox: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fca5a5',
  color: '#991b1b',
  padding: 12,
  borderRadius: 8,
  fontSize: 13,
};

const preBox: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
  fontSize: 11.5,
  overflow: 'auto',
  maxHeight: '70vh',
  fontFamily: 'ui-monospace,Menlo,monospace',
};
