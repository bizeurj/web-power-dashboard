'use client';

type Accent = 'default' | 'purple' | 'teal' | 'gold' | 'rose' | 'emerald';

export function Card({
  title,
  domain,
  accent = 'default',
  children,
  style,
}: {
  title?: string;
  domain?: string;
  accent?: Accent;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const accentColor: Record<Accent, string> = {
    default: 'transparent',
    purple: 'var(--purple)',
    teal: 'var(--teal)',
    gold: 'var(--gold)',
    rose: 'var(--rose)',
    emerald: 'var(--emerald)',
  };
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: accent !== 'default' ? `3px solid ${accentColor[accent]}` : '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow)',
        padding: 20,
        ...style,
      }}
    >
      {title && (
        <h2
          style={{
            margin: '0 0 4px',
            fontSize: 15,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>{title}</span>
          {domain && (
            <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 11.5 }}>{domain}</span>
          )}
        </h2>
      )}
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--muted)',
        margin: '22px 0 10px',
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export function ExecIntro({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 14,
        color: 'var(--text-2)',
        lineHeight: 1.6,
        margin: '8px 0 18px',
        padding: '14px 16px',
        background: 'var(--surface-2)',
        borderLeft: '3px solid var(--text)',
        borderRadius: 8,
      }}
    >
      {children}
    </div>
  );
}

type InsightTone = 'info' | 'good' | 'bad' | 'warn' | 'emerald' | 'purple' | 'gold';

export function Insight({
  tone = 'info',
  icon = 'i',
  children,
}: {
  tone?: InsightTone;
  icon?: string;
  children: React.ReactNode;
}) {
  const tones: Record<InsightTone, { border: string; bg: string; color: string }> = {
    info: { border: 'var(--primary)', bg: 'var(--primary-soft)', color: 'var(--primary-deep)' },
    good: { border: 'var(--good)', bg: 'var(--good-soft)', color: 'var(--good)' },
    bad: { border: 'var(--bad)', bg: 'var(--bad-soft)', color: 'var(--bad)' },
    warn: { border: 'var(--warn)', bg: 'var(--warn-soft)', color: 'var(--warn)' },
    emerald: { border: 'var(--emerald)', bg: 'var(--emerald-soft)', color: 'var(--emerald)' },
    purple: { border: 'var(--purple)', bg: 'var(--purple-soft)', color: 'var(--purple-deep)' },
    gold: { border: 'var(--gold)', bg: 'var(--gold-soft)', color: 'var(--gold-deep)' },
  };
  const t = tones[tone];
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 14px',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${t.border}`,
        borderRadius: 8,
        background: 'var(--surface-2)',
        fontSize: 13,
        lineHeight: 1.5,
        marginTop: 8,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          background: t.bg,
          color: t.color,
        }}
      >
        {icon}
      </div>
      <div>{children}</div>
    </div>
  );
}
