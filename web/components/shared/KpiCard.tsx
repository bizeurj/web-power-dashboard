'use client';

import { deltaClass, deltaText } from '@/lib/format';

type Hero = 'default' | 'purple' | 'teal' | 'gold' | 'rose' | 'emerald' | 'bad';

export function KpiCard({
  label,
  value,
  delta,
  deltaLowerIsBetter,
  hero = 'default',
  hint,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLowerIsBetter?: boolean;
  hero?: Hero;
  hint?: string;
}) {
  const heroBg: Record<Hero, string> = {
    default: 'var(--surface-2)',
    purple: 'linear-gradient(180deg,#fafbff 0%,#f5f0ff 100%)',
    teal: 'linear-gradient(180deg,#fafdff 0%,#ecfeff 100%)',
    gold: 'linear-gradient(180deg,#fffdf5 0%,#fef3c7 100%)',
    rose: 'linear-gradient(180deg,#fffbfd 0%,#fdf2f8 100%)',
    emerald: 'linear-gradient(180deg,#f8fffd 0%,#ccfbf1 100%)',
    bad: 'linear-gradient(180deg,#fffafa 0%,#fee2e2 100%)',
  };
  const heroBorder: Record<Hero, string> = {
    default: 'var(--border)',
    purple: '#e9d5ff',
    teal: '#a5f3fc',
    gold: '#fcd34d',
    rose: '#fbcfe8',
    emerald: '#5eead4',
    bad: '#fca5a5',
  };
  const heroValueColor: Record<Hero, string> = {
    default: 'var(--text)',
    purple: 'var(--purple-deep)',
    teal: 'var(--teal)',
    gold: 'var(--gold-deep)',
    rose: 'var(--rose)',
    emerald: 'var(--emerald)',
    bad: 'var(--bad)',
  };

  const isHero = hero !== 'default';

  const dClass = deltaClass(delta, { lowerIsBetter: deltaLowerIsBetter });
  const dText = delta !== undefined && delta !== null ? deltaText(delta) : null;

  return (
    <div
      style={{
        padding: '13px 14px',
        border: `1px solid ${heroBorder[hero]}`,
        borderRadius: 8,
        background: heroBg[hero],
      }}
    >
      <div
        style={{
          color: 'var(--muted)',
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: isHero ? 30 : 24,
          fontWeight: 600,
          marginTop: 4,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          color: heroValueColor[hero],
        }}
      >
        {value}
      </div>
      {dText && (
        <div
          style={{
            fontSize: 12,
            marginTop: 3,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 500,
            color: dClass === 'good' ? 'var(--good)' : dClass === 'bad' ? 'var(--bad)' : 'var(--neutral)',
          }}
        >
          {dText}
        </div>
      )}
      {hint && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function KpiRow({ children, cols = 4 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 10,
        marginTop: 14,
      }}
    >
      {children}
    </div>
  );
}
