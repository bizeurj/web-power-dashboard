/**
 * Formatters mirrored from the local HTML artifact. Keep signatures stable
 * so tab components can be written like the original render functions.
 */

export const fmt = (n?: number | null): string =>
  (n ?? 0).toLocaleString('en-US');

export const fmtMoney = (n?: number | null): string =>
  '$' + Math.round(n ?? 0).toLocaleString('en-US');

export const fmtMoney2 = (n?: number | null): string =>
  '$' + (n ?? 0).toFixed(2);

export const fmtPct = (n?: number | null, digits = 1): string => {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return (n * 100).toFixed(digits) + '%';
};

export const fmtSec = (s?: number | null): string => {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

export type DeltaDirection = 'good' | 'bad' | 'neutral';

export function deltaClass(d: number | null | undefined, opts: { lowerIsBetter?: boolean } = {}): DeltaDirection {
  if (d === null || d === undefined || Number.isNaN(d)) return 'neutral';
  if (Math.abs(d) < 0.5) return 'neutral';
  const lo = !!opts.lowerIsBetter;
  const isGood = lo ? d < 0 : d > 0;
  return isGood ? 'good' : 'bad';
}

export function deltaText(d: number | null | undefined, suffix = '% MoM'): string {
  if (d === null || d === undefined || Number.isNaN(d)) return '-';
  const arrow = d > 0 ? '↑' : d < 0 ? '↓' : '→';
  return `${arrow} ${Math.abs(d).toFixed(1)}${suffix}`;
}

export function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function isoToFriendly(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Coerce unknown to a finite number, with a fallback. Avoids .toFixed crashes on undefined/null/NaN/string. */
export function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Safely format a number with toFixed semantics, defaulting if value is missing. */
export function fixed(v: unknown, digits = 1, fallback = '-'): string {
  if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(digits);
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toFixed(digits);
  }
  return fallback;
}

/** Normalize various page-path shapes (with/without leading slash, with hostname) into a comparable key. */
export function pageKey(input: string): string {
  if (!input) return '';
  let s = input.trim();
  // Strip protocol + host
  s = s.replace(/^https?:\/\/[^/]+/i, '');
  if (!s.startsWith('/')) s = '/' + s;
  // Drop trailing slash unless it's root
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s.toLowerCase();
}
