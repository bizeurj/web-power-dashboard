/**
 * TypeScript types for the snapshot.json produced by the orchestrator.
 * These mirror the shape the fetchers emit; keep in sync if fetchers change.
 */

export type Snapshot = {
  schemaVersion: number;
  generatedAt: string;
  runDurationMs: number;
  sources: {
    ga4?: Ga4Source | { error: string };
    profound?: ProfoundSource | { error: string };
    gsc?: GscSource | { error: string };
  };
};

export type Ga4Source = {
  fetchedAt: string;
  lookbackDays: number;
  properties: Ga4Property[];
  skipped: string[];
  warning?: string;
};

export type Ga4Property = {
  site: string;
  propertyId: string;
  hostnames: string[];
  hostnameScope?: unknown;
  window: { current: { startDate: string; endDate: string }; prior?: { startDate: string; endDate: string } };
  headline: {
    current: Ga4Headline;
    prior: Ga4Headline;
    delta: Partial<Record<keyof Ga4Headline, number>>;
  };
  daily: number[];
  dailyPrior: number[];
  monthly?: Array<{ yearMonth: string; sessions: number }>;
  sources: Array<{ sourceMedium: string; sessions: number; engagementRate?: number }>;
  pages: Array<{ path: string; title?: string; views: number; avgSessionDurationSec?: number; bounceRate?: number }>;
  llm?: {
    referrers: Array<{ brand: string; sessions: number; users?: number; bounceRate?: number; avgSessionDurationSec?: number; pagesPerSession?: number; rawSources?: string[] }>;
    landingPages: Array<{ landingPage: string; sessions: number; bounceRate?: number; avgSessionDurationSec?: number }>;
    shareOfTraffic: number;
    totalSessions: number;
  };
  googleAds?: {
    headline: Ga4AdsHeadline;
    headlinePrior?: Ga4AdsHeadline;
    headlineDelta?: Partial<Record<keyof Ga4AdsHeadline, number>>;
    daily: number[];
    campaigns: Array<{ campaign: string; cost: number; sessions: number; cpc?: number; costPerSession?: number; engagementRate?: number; clicks?: number }>;
    keywords: Array<{ keyword: string; cost: number; sessions: number; cpc?: number; clicks?: number; engagementRate?: number }>;
    byNetwork: Array<{ network: string; cost: number; sessions: number; clicks?: number; cpc?: number }>;
    landingPages: Array<{ landingPage: string; cost: number; sessions: number; engagementRate?: number; clicks?: number }>;
    landingPagesYtd?: Array<{ landingPage: string; cost: number; sessions: number; clicks?: number }>;
    byDevice?: Array<{ device: string; cost: number; sessions: number }> | { error: string };
    ytd?: Array<{ yearMonth: string; cost: number; sessions: number; cpc?: number; costPerSession?: number; bounceRate?: number; avgSessionDurationSec?: number; engagementRate?: number }>;
  };
  ytd?: Array<{ yearMonth: string; totalSessions: number; totalUsers?: number; llmSessions: number; llmShare: number }>;
};

export type Ga4Headline = {
  sessions: number;
  users: number;
  bounceRate: number;
  avgSessionDurationSec: number;
  engagementRate?: number;
  pagesPerSession?: number;
};

export type Ga4AdsHeadline = {
  cost: number;
  clicks: number;
  sessions: number;
  cpc: number;
  costPerSession?: number;
};

export type ProfoundSource = {
  fetchedAt: string;
  lookbackDays: number;
  org: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; organization?: { id: string; name: string } }>;
  domains?: unknown;
  resolvedCategoryId?: string;
  content?: {
    topUrls?: Array<[string, number, string?, string?]>;
    topDomains?: Array<[string, number, string?]>;
    topPrompts?: Array<[string, number]>;
    byCitationCategory?: Array<[string, number]>;
    byModel?: Array<[string, number]>;
    byTopic?: Array<[string, number]>;
    topics?: Array<{ id: string; name: string; mentions?: number }>;
    urlsByTopic?: Record<string, Array<[string, number, string?]>>;
    urlsByCategory?: Record<string, Array<[string, number, string?]>>;
    domainsByTopic?: Record<string, Array<[string, number, string?]>>;
    promptsByTopic?: Record<string, Array<[string, number]>>;
  };
  contentYtd?: unknown;
  ytd?: Array<[string, number, number, number]>; // [month, vis, sov, mentions]
  orgError?: string;
  categoriesError?: string;
  ytdError?: string;
};

export type GscSource = {
  fetchedAt: string;
  lookbackDays: number;
  siteUrl: string;
  window: { current: { startDate: string; endDate: string }; prior?: { startDate: string; endDate: string } };
  headline: GscHeadline;
  headlinePrior?: GscHeadline;
  headlineDelta?: Partial<Record<keyof GscHeadline, number>>;
  daily: Array<{ date: string; clicks: number; impressions: number; ctr?: number; position?: number }>;
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>;
  country?: Array<{ country: string; clicks: number; impressions: number }>;
  device?: Array<{ device: string; clicks: number; impressions: number }>;
  ytd?: Array<{ yearMonth: string; clicks: number; impressions: number; ctr?: number; position?: number }>;
};

export type GscHeadline = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export function isErrorShape(v: unknown): v is { error: string } {
  return !!v && typeof v === 'object' && 'error' in v;
}

export function getGa4(snapshot: Snapshot): Ga4Source | null {
  const s = snapshot.sources.ga4;
  if (!s || isErrorShape(s)) return null;
  return s;
}

export function getProfound(snapshot: Snapshot): ProfoundSource | null {
  const s = snapshot.sources.profound;
  if (!s || isErrorShape(s)) return null;
  return s;
}

export function getGsc(snapshot: Snapshot): GscSource | null {
  const s = snapshot.sources.gsc;
  if (!s || isErrorShape(s)) return null;
  return s;
}

export function getMainProperty(ga4: Ga4Source | null): Ga4Property | null {
  if (!ga4 || !Array.isArray(ga4.properties) || ga4.properties.length === 0) return null;
  // First property is workhuman.com per orchestrator convention.
  return ga4.properties[0];
}

/**
 * Defensive array coercion. The snapshot's `topDomains`, `topUrls`, etc. are
 * supposed to be arrays of tuples but Profound has been observed returning
 * either an empty object `{}` when there are no results, or a wrapping object
 * like `{ items: [...] }`. This helper returns an array no matter what.
 */
export function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') {
    const obj = v as { items?: unknown; data?: unknown; results?: unknown };
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.results)) return obj.results as T[];
  }
  return [];
}
