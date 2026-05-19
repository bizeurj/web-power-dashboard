/**
 * Content resonance scoring + drill-down data assembly.
 *
 * Combines four signals per page:
 *   - GA4 pageviews (traffic)
 *   - GA4 LLM-attributed landing-page sessions (AI-driven traffic)
 *   - GSC clicks + impressions (organic search demand)
 *   - Profound URL citation count (AI-search visibility)
 *
 * Each signal is normalized 0-1 across the universe of known pages, then
 * weighted into a single resonance score. The defaults skew toward traffic
 * + organic clicks because those are the realized-attention signals;
 * citations and LLM sessions are leading indicators that compound.
 */

import {
  Snapshot,
  getGa4,
  getProfound,
  getGsc,
  getMainProperty,
  Ga4Property,
  GscSource,
  ProfoundSource,
} from './snapshot-types';
import { pageKey } from './format';

export type ContentRow = {
  path: string;             // canonical /-prefixed path
  title?: string;
  views: number;             // GA4 page views
  avgTimeSec: number;
  bounceRate: number;
  gscClicks: number;
  gscImpressions: number;
  gscCtr: number;
  gscPosition: number;
  llmSessions: number;       // LLM-attributed landing-page sessions
  citations: number;         // sum of Profound URL citation counts
  citationCategory?: string; // owned/competitor/other (from Profound topUrls)
  resonance: number;         // 0-100 composite score
  signals: {
    traffic: number;        // normalized 0-1
    search: number;
    llm: number;
    aeo: number;
  };
};

const WEIGHTS = {
  traffic: 0.35,
  search: 0.35,
  llm: 0.15,
  aeo: 0.15,
};

export function buildContentRows(snapshot: Snapshot): ContentRow[] {
  const ga4 = getGa4(snapshot);
  const gsc = getGsc(snapshot);
  const profound = getProfound(snapshot);
  const wh = getMainProperty(ga4);

  if (!wh) return [];

  // Build maps keyed by canonical page path.
  const byPath = new Map<string, ContentRow>();

  // Seed from GA4 pages — these are the universe of pages we care about.
  for (const p of wh.pages || []) {
    const k = pageKey(p.path);
    byPath.set(k, {
      path: k,
      title: p.title,
      views: p.views,
      avgTimeSec: p.avgSessionDurationSec || 0,
      bounceRate: p.bounceRate || 0,
      gscClicks: 0,
      gscImpressions: 0,
      gscCtr: 0,
      gscPosition: 0,
      llmSessions: 0,
      citations: 0,
      resonance: 0,
      signals: { traffic: 0, search: 0, llm: 0, aeo: 0 },
    });
  }

  // Merge GSC pages.
  if (gsc?.pages) {
    for (const p of gsc.pages) {
      const k = pageKey(p.page);
      const existing = byPath.get(k);
      if (existing) {
        existing.gscClicks = p.clicks;
        existing.gscImpressions = p.impressions;
        existing.gscCtr = p.ctr;
        existing.gscPosition = p.position;
      } else {
        // GSC saw the page but GA4 didn't surface it in top-N. Add a stub.
        byPath.set(k, {
          path: k,
          views: 0,
          avgTimeSec: 0,
          bounceRate: 0,
          gscClicks: p.clicks,
          gscImpressions: p.impressions,
          gscCtr: p.ctr,
          gscPosition: p.position,
          llmSessions: 0,
          citations: 0,
          resonance: 0,
          signals: { traffic: 0, search: 0, llm: 0, aeo: 0 },
        });
      }
    }
  }

  // Merge LLM landing pages.
  if (wh.llm?.landingPages) {
    for (const lp of wh.llm.landingPages) {
      const k = pageKey(lp.landingPage);
      const existing = byPath.get(k);
      if (existing) {
        existing.llmSessions += lp.sessions;
      }
    }
  }

  // Merge Profound citation counts (topUrls + urlsByCategory).
  // The Profound URL strings are typically `host/path` without protocol;
  // we strip the host to compare path-only.
  if (profound?.content?.topUrls) {
    for (const u of profound.content.topUrls) {
      const url = u[0]; // e.g. "workhuman.com/blog/employee-recognition-software/"
      const cat = u[3] || u[2];
      if (!url.includes('workhuman.com')) continue;
      const path = url.replace(/^[^/]+/, ''); // strip host, keep /path
      const k = pageKey(path);
      const existing = byPath.get(k);
      if (existing) {
        existing.citations += u[1];
        existing.citationCategory = cat;
      } else {
        // Profound sees a URL we don't have GA4/GSC stats for. Add a stub.
        byPath.set(k, {
          path: k,
          views: 0,
          avgTimeSec: 0,
          bounceRate: 0,
          gscClicks: 0,
          gscImpressions: 0,
          gscCtr: 0,
          gscPosition: 0,
          llmSessions: 0,
          citations: u[1],
          citationCategory: cat,
          resonance: 0,
          signals: { traffic: 0, search: 0, llm: 0, aeo: 0 },
        });
      }
    }
  }

  const rows = Array.from(byPath.values());

  // Normalize each signal and compute composite score.
  const maxViews = Math.max(1, ...rows.map((r) => r.views));
  const maxClicks = Math.max(1, ...rows.map((r) => r.gscClicks));
  const maxLlm = Math.max(1, ...rows.map((r) => r.llmSessions));
  const maxCit = Math.max(1, ...rows.map((r) => r.citations));

  for (const r of rows) {
    r.signals.traffic = r.views / maxViews;
    r.signals.search = r.gscClicks / maxClicks;
    r.signals.llm = r.llmSessions / maxLlm;
    r.signals.aeo = r.citations / maxCit;
    r.resonance =
      Math.round(
        (r.signals.traffic * WEIGHTS.traffic +
          r.signals.search * WEIGHTS.search +
          r.signals.llm * WEIGHTS.llm +
          r.signals.aeo * WEIGHTS.aeo) *
          100
      );
  }

  return rows.sort((a, b) => b.resonance - a.resonance);
}

/** Detail object for a single page drill-down. */
export type ContentDetail = {
  row: ContentRow;
  // Top-line GA4 site context (so we can show "this page = X% of site sessions")
  siteSessions: number;
  // GSC overall context (so we can show "this page = X% of site clicks")
  siteGscClicks: number;
  // List of Profound topics this URL ranks within, with citation counts.
  topicAppearances: Array<{ topic: string; citations: number; category?: string }>;
  // For the date-range chart on drill-down — currently we only have the
  // 30-day daily series at the site level. Per-page daily data would need
  // a fetcher enhancement; for v1 we show the site trend with a note.
  siteDaily: number[];
};

export function buildContentDetail(snapshot: Snapshot, path: string): ContentDetail | null {
  const rows = buildContentRows(snapshot);
  const row = rows.find((r) => r.path === pageKey(path));
  if (!row) return null;

  const ga4 = getGa4(snapshot);
  const gsc = getGsc(snapshot);
  const profound = getProfound(snapshot);
  const wh = getMainProperty(ga4);

  const topicAppearances: Array<{ topic: string; citations: number; category?: string }> = [];
  const urlsByTopic = profound?.content?.urlsByTopic || {};
  for (const [topic, urls] of Object.entries(urlsByTopic)) {
    for (const u of urls) {
      const url = u[0];
      if (!url.includes('workhuman.com')) continue;
      const urlPath = pageKey(url.replace(/^[^/]+/, ''));
      if (urlPath === row.path) {
        topicAppearances.push({ topic, citations: u[1], category: u[2] });
      }
    }
  }
  topicAppearances.sort((a, b) => b.citations - a.citations);

  return {
    row,
    siteSessions: wh?.headline.current.sessions || 0,
    siteGscClicks: gsc?.headline.clicks || 0,
    topicAppearances,
    siteDaily: wh?.daily || [],
  };
}

export type DateRange = '7d' | '30d' | '90d' | 'ytd' | 'custom';

export const RANGE_LABELS: Record<DateRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  'ytd': 'Year to date',
  'custom': 'Custom',
};
