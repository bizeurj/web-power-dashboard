'use client';

import { DateRange, RANGE_LABELS } from '@/lib/content-resonance';

export function DateRangePicker({
  value,
  onChange,
  customStart,
  customEnd,
  onCustomChange,
}: {
  value: DateRange;
  onChange: (r: DateRange) => void;
  customStart?: string;
  customEnd?: string;
  onCustomChange?: (start: string, end: string) => void;
}) {
  const presets: DateRange[] = ['7d', '30d', '90d', 'ytd', 'custom'];
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
        Range
      </span>
      {presets.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            padding: '5px 11px',
            background: value === p ? 'var(--text)' : 'var(--surface)',
            color: value === p ? '#fff' : 'var(--text-2)',
            border: `1px solid ${value === p ? 'var(--text)' : 'var(--border)'}`,
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {RANGE_LABELS[p]}
        </button>
      ))}
      {value === 'custom' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 6 }}>
          <input
            type="date"
            value={customStart || ''}
            onChange={(e) => onCustomChange?.(e.target.value, customEnd || '')}
            style={dateInputStyle}
          />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>to</span>
          <input
            type="date"
            value={customEnd || ''}
            onChange={(e) => onCustomChange?.(customStart || '', e.target.value)}
            style={dateInputStyle}
          />
        </div>
      )}
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'inherit',
};
