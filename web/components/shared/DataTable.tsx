'use client';

import { useState } from 'react';

export type Column<Row> = {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  render?: (row: Row) => React.ReactNode;
  sortValue?: (row: Row) => number | string;
};

export function DataTable<Row>({
  columns,
  rows,
  emptyText = 'No data',
  onRowClick,
  defaultSortKey,
  defaultSortDir = 'desc',
  pageSize,
}: {
  columns: Column<Row>[];
  rows: Row[];
  emptyText?: string;
  onRowClick?: (row: Row) => void;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);
  const [page, setPage] = useState(0);

  const sorted = [...rows];
  if (sortKey) {
    const col = columns.find((c) => c.key === sortKey);
    if (col) {
      sorted.sort((a, b) => {
        const av = col.sortValue ? col.sortValue(a) : (a as Record<string, unknown>)[sortKey] as number | string;
        const bv = col.sortValue ? col.sortValue(b) : (b as Record<string, unknown>)[sortKey] as number | string;
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
  }

  const total = sorted.length;
  const pageCount = pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const visible = pageSize ? sorted.slice(page * pageSize, (page + 1) * pageSize) : sorted;

  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => {
                    if (sortKey === c.key) {
                      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortKey(c.key);
                      setSortDir('desc');
                    }
                  }}
                  style={{
                    padding: '8px 10px',
                    textAlign: c.align || 'left',
                    background: '#f6f8fb',
                    fontWeight: 600,
                    fontSize: 11.5,
                    color: 'var(--text-2)',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    width: c.width,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span style={{ marginLeft: 4, color: 'var(--muted)' }}>
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, idx) => (
              <tr
                key={idx}
                onClick={() => onRowClick?.(row)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  borderBottom: '1px solid var(--border)',
                  background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                }}
                onMouseEnter={(e) => {
                  if (onRowClick) (e.currentTarget.style.background = 'var(--primary-soft)');
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)';
                }}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      padding: '8px 10px',
                      textAlign: c.align || 'left',
                      verticalAlign: 'top',
                      fontVariantNumeric: c.align === 'right' ? 'tabular-nums' : undefined,
                    }}
                  >
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize && pageCount > 1 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Showing {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              style={paginationBtn}
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              style={paginationBtn}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const paginationBtn: React.CSSProperties = {
  padding: '5px 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};
