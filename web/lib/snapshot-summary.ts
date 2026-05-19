/**
 * Snapshot summarizer for the LLM Insights panel.
 *
 * The full snapshot is ~800KB. Way too big for Claude to chew on every
 * page load. We extract only the fields a strategic analyst would actually
 * use for "what's interesting this morning" — headline metrics, deltas,
 * top movers, source mix, AEO position.
 */

import { Snapshot, getGa4, getProfound, getGsc, getMainProperty, asArray } from './snapshot-types';

export type SnapshotSummary = {
  generatedAt: string;
  ga4: {
    site: string;
    window: { startDate?: string; endDate?: string };
    current: Record<string, number>;
    prior: Record<string, number>;
    delta: Record<string, number>;
    topSources: Array<{ source: string; sessions: number }>;
    topPages: Array<{ path: string; views: number; bounce: number; avgTime: number }>;
    llmSessions: number;
    llmShareOfTraffic: number;
    llmReferrers: Array<{ brand: string; sessions: number }>;
  } | null;
  paid: {
    cost: number;
    sessions: number;
    cpc: number;
    costDelta: number;
    sessionsDelta: number;
    topCampaign?: { name: string; cost: number; share: number };
  } | null;
  gsc: {
    headline: Record<string, number>;
    delta: Record<string, number>;
    topQueries: Array<{ query: string; clicks: number; position: number }>;
  } | null;
  profound: {
    organization?: string;
    category?: string;
    workhumanCitations: number;
    workhumanRank: number | null;
    topDomains: Array<{ domain: string; citations: number; category?: string }>;
    topPrompts: Array<{ prompt: string; volume: number }>;
    byModel: Array<{ model: string; volume: number }>;
  } | null;
};

export function summarizeSnapshot(snapshot: Snapshot, tabContext?: string): SnapshotSummary {
  const ga4 = getGa4(snapshot);
  const profound = getProfound(snapshot);
  const gsc = getGsc(snapshot);
  const wh = getMainProperty(ga4);

  const ga4Block = wh
    ? {
        site: wh.site,
        window: wh.window?.current || {},
        current: (wh.headline?.current as Record<string, number>) || {},
        prior: (wh.headline?.prior as Record<string, number>) || {},
        delta: (wh.headline?.delta as Record<string, number>) || {},
        topSources: asArray<{ sourceMedium: string; sessions: number }>(wh.sources)
          .slice(0, 8)
          .map((s) => ({ source: s.sourceMedium, sessions: s.sessions })),
        topPages: asArray<{ path: string; views: number; bounceRate?: number; avgSessionDurationSec?: number }>(wh.pages)
          .slice(0, 10)
          .map((p) => ({
            path: p.path,
            views: p.views,
            bounce: p.bounceRate ?? 0,
            avgTime: p.avgSessionDurationSec ?? 0,
          })),
        llmSessions: wh.llm?.totalSessions ?? 0,
        llmShareOfTraffic: wh.llm?.shareOfTraffic ?? 0,
        llmReferrers: asArray<{ brand: string; sessions: number }>(wh.llm?.referrers)
          .slice(0, 5)
          .map((r) => ({ brand: r.brand, sessions: r.sessions })),
      }
    : null;

  const adsHead = wh?.googleAds?.headline;
  const adsCampaigns = asArray<{ campaign: string; cost: number }>(wh?.googleAds?.campaigns);
  const paidBlock =
    adsHead && adsHead.cost > 0
      ? {
          cost: adsHead.cost,
          sessions: adsHead.sessions,
          cpc: adsHead.cpc,
          costDelta: wh?.googleAds?.headlineDelta?.cost ?? 0,
          sessionsDelta: wh?.googleAds?.headlineDelta?.sessions ?? 0,
          topCampaign: adsCampaigns[0]
            ? {
                name: adsCampaigns[0].campaign,
                cost: adsCampaigns[0].cost,
                share: adsCampaigns[0].cost / Math.max(1, adsHead.cost),
              }
            : undefined,
        }
      : null;

  const gscBlock = gsc?.headline
    ? {
        headline: gsc.headline as unknown as Record<string, number>,
        delta: (gsc.headlineDelta as Record<string, number>) || {},
        topQueries: asArray<{ query: string; clicks: number; position: number }>(gsc.queries)
          .slice(0, 10)
          .map((q) => ({ query: q.query, clicks: q.clicks, position: q.position })),
      }
    : null;

  const topDomains = asArray<[string, number, string?]>(profound?.content?.topDomains);
  const whDomain = topDomains.find(
    (d) => Array.isArray(d) && typeof d[0] === 'string' && d[0].toLowerCase().includes('workhuman')
  );
  const whRank = whDomain ? topDomains.findIndex((d) => d === whDomain) + 1 : null;

  const profoundBlock = profound
    ? {
        organization: profound.org?.[0]?.name,
        category: profound.categories?.[0]?.name,
        workhumanCitations: whDomain?.[1] ?? 0,
        workhumanRank: whRank,
        topDomains: topDomains.slice(0, 10).map((d) => ({
          domain: d[0],
          citations: d[1],
          category: d[2],
        })),
        topPrompts: asArray<[string, number]>(profound.content?.topPrompts)
          .slice(0, 8)
          .map((p) => ({ prompt: p[0], volume: p[1] })),
        byModel: asArray<[string, number]>(profound.content?.byModel)
          .slice(0, 8)
          .map((m) => ({ model: m[0], volume: m[1] })),
      }
    : null;

  void tabContext; // reserved for future per-tab biasing of the summary

  return {
    generatedAt: snapshot.generatedAt,
    ga4: ga4Block,
    paid: paidBlock,
    gsc: gscBlock,
    profound: profoundBlock,
  };
}
