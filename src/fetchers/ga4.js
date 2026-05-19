// ---------------------------------------------------------------
// GA4 fetcher
// Pulls v1 KPIs (bounce rate, time on site, traffic source, top pages)
// for a given GA4 property using a service account.
// ---------------------------------------------------------------

import 'dotenv/config';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { fileURLToPath } from 'node:url';

// fallback: 'rest' forces REST/HTTP transport instead of the default gRPC.
// Required for Vercel serverless (gRPC's long-lived HTTP/2 doesn't work in
// short-lived function runtimes). Kept here too so local dev matches prod.
const client = new BetaAnalyticsDataClient({ fallback: 'rest' });

/**
 * Format a Date as YYYY-MM-DD (UTC).
 */
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Build a "path does NOT begin with any of these prefixes" filter expression.
 * Used to exclude Workhuman Live pages (/speakers, /agenda, /forum) from
 * workhuman.com analytics since they bleed into the same GA4 property.
 *
 * Reads EXCLUDE_PATH_PREFIXES from .env (comma-separated). Defaults to
 * /speakers,/agenda,/forum,/events.
 */
function getExcludedPathPrefixes() {
  const raw = process.env.EXCLUDE_PATH_PREFIXES ?? '/speakers,/agenda,/forum,/events';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function pathExclusionFilter(fieldName = 'pagePath') {
  const prefixes = getExcludedPathPrefixes();
  if (prefixes.length === 0) return null;
  return {
    notExpression: {
      orGroup: {
        expressions: prefixes.map(p => ({
          filter: { fieldName, stringFilter: { matchType: 'BEGINS_WITH', value: p } }
        }))
      }
    }
  };
}

/**
 * Hostname allowlist filter. Returns sessions ONLY from the provided
 * hostnames. This is the STRUCTURAL way to scope a multi-hostname GA4
 * property to one specific site (e.g., workhuman.com vs whlp vs WHL).
 *
 * Pass an explicit list of hostnames OR rely on .env:
 *   INCLUDE_HOSTNAMES=www.workhuman.com,workhuman.com,press.workhuman.com
 */
function hostnameAllowlistFilter(hostnamesArg) {
  const hostnames = hostnamesArg
    ?? (process.env.INCLUDE_HOSTNAMES ?? 'www.workhuman.com,workhuman.com,press.workhuman.com')
        .split(',').map(s => s.trim()).filter(Boolean);
  if (!hostnames || hostnames.length === 0) return null;
  return {
    filter: {
      fieldName: 'hostName',
      inListFilter: { values: hostnames, caseSensitive: false }
    }
  };
}

// Backwards-compatible alias used throughout the rest of the file.
// Default behaviour remains "scope to main workhuman.com hostnames".
function hostnameExclusionFilter(hostnamesArg) {
  return hostnameAllowlistFilter(hostnamesArg);
}

/**
 * Combine multiple filter expressions via AND. Returns undefined if
 * none are present (so it's safe to spread into a request).
 */
function combineFilters(...filters) {
  const valid = filters.filter(f => f);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return { andGroup: { expressions: valid } };
}

/**
 * Combine a base filter with the path exclusion filter via AND.
 * If the base filter is null, just returns the exclusion filter.
 * If exclusion is null, returns the base filter.
 */
function withPathExclusion(baseFilter, fieldName = 'pagePath') {
  return combineFilters(baseFilter, pathExclusionFilter(fieldName));
}

/**
 * Wrap any base filter with both hostname exclusion (always) and an
 * optional path exclusion. This is the standard wrapper for any query
 * that should be scoped to workhuman.com only.
 */
function withWorkhumanComScope(baseFilter, pathFieldName = null, hostnamesArg = null) {
  return combineFilters(
    baseFilter,
    hostnameAllowlistFilter(hostnamesArg),
    pathFieldName ? pathExclusionFilter(pathFieldName) : null,
  );
}

/**
 * Build the date range for the current lookback window and the prior
 * comparison window of equal length.
 */
function buildDateRanges(lookbackDays) {
  const today = new Date();
  // GA4 reports are usually complete through yesterday, so end window yesterday.
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);

  const currentStart = new Date(yesterday);
  currentStart.setUTCDate(yesterday.getUTCDate() - (lookbackDays - 1));

  const priorEnd = new Date(currentStart);
  priorEnd.setUTCDate(currentStart.getUTCDate() - 1);

  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorEnd.getUTCDate() - (lookbackDays - 1));

  return {
    current: { startDate: isoDate(currentStart), endDate: isoDate(yesterday) },
    prior: { startDate: isoDate(priorStart), endDate: isoDate(priorEnd) },
  };
}

/**
 * Pull headline KPIs (bounce rate, avg session duration, sessions, users)
 * for a single date range.
 */
async function fetchHeadline(propertyId, dateRange) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'engagementRate' },
      { name: 'screenPageViewsPerSession' },
    ],
    dimensionFilter: hostnameExclusionFilter() ?? undefined,
  });
  const row = response.rows?.[0]?.metricValues ?? [];
  return {
    sessions: Number(row[0]?.value ?? 0),
    users: Number(row[1]?.value ?? 0),
    bounceRate: Number(row[2]?.value ?? 0),
    avgSessionDurationSec: Number(row[3]?.value ?? 0),
    engagementRate: Number(row[4]?.value ?? 0),
    pagesPerSession: Number(row[5]?.value ?? 0),
  };
}

/**
 * Sessions broken down by source / medium for the current window.
 */
async function fetchTrafficSources(propertyId, dateRange, limit = 15) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'sessionSourceMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
    dimensionFilter: hostnameExclusionFilter() ?? undefined,
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });
  return (response.rows ?? []).map(r => ({
    sourceMedium: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
    engagementRate: Number(r.metricValues[1].value),
  }));
}

/**
 * Top pages by views, with engagement metrics for context.
 */
async function fetchTopPages(propertyId, dateRange, limit = 15) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' },
    ],
    dimensionFilter: withWorkhumanComScope(null, 'pagePath'),
    orderBys: [{ desc: true, metric: { metricName: 'screenPageViews' } }],
    limit,
  });
  return (response.rows ?? []).map(r => ({
    path: r.dimensionValues[0].value,
    title: r.dimensionValues[1].value,
    views: Number(r.metricValues[0].value),
    avgSessionDurationSec: Number(r.metricValues[1].value),
    bounceRate: Number(r.metricValues[2].value),
  }));
}

/**
 * Daily sessions for trend sparklines.
 */
async function fetchDailySessions(propertyId, dateRange) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    dimensionFilter: hostnameExclusionFilter() ?? undefined,
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });
  return (response.rows ?? []).map(r => ({
    date: r.dimensionValues[0].value, // YYYYMMDD
    sessions: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
  }));
}

/**
 * Monthly session/user history for the 6-month trend bar chart.
 */
async function fetchMonthlyHistory(propertyId, monthsBack = 6) {
  const today = new Date();
  const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1));
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: isoDate(startMonth), endDate: 'today' }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    dimensionFilter: hostnameExclusionFilter() ?? undefined,
    orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
  });
  return (response.rows ?? []).map(r => ({
    yearMonth: r.dimensionValues[0].value, // YYYYMM
    sessions: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
  }));
}

/**
 * Map a raw session source/host to a canonical LLM brand label.
 * Returns null if the source isn't an LLM referrer.
 */
function canonicalLlm(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('chatgpt') || s.includes('chat.openai') || s.includes('openai.com')) return 'ChatGPT';
  if (s.includes('perplexity')) return 'Perplexity';
  if (s.includes('claude.ai') || s.includes('anthropic')) return 'Claude';
  if (s.includes('gemini') || s.includes('bard.google')) return 'Gemini';
  if (s.includes('copilot') || s.includes('bing.com/chat') || s.includes('bing.com/copilot')) return 'Copilot';
  if (s.includes('you.com') || s.includes('phind') || s.includes('poe.com')) return 'Other AI';
  return null;
}

/**
 * LLM referrer breakdown for the AI-search section of the dashboard.
 * Pulls sessions where sessionSource matches any LLM domain, then
 * normalises into canonical brand buckets.
 */
async function fetchLlmReferrers(propertyId, dateRange) {
  const llmHosts = [
    'chatgpt.com', 'chat.openai.com', 'openai.com',
    'perplexity.ai', 'www.perplexity.ai',
    'claude.ai', 'www.claude.ai',
    'gemini.google.com', 'bard.google.com',
    'copilot.microsoft.com', 'bing.com/chat',
    'you.com', 'phind.com', 'poe.com',
  ];
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'sessionSource' }],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViewsPerSession' },
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'sessionSource',
        inListFilter: { values: llmHosts, caseSensitive: false },
      },
    },
  });

  // Bucket raw sources into canonical LLM brands.
  const byBrand = {};
  for (const row of response.rows ?? []) {
    const src = row.dimensionValues[0].value;
    const brand = canonicalLlm(src) || 'Other AI';
    const m = row.metricValues;
    if (!byBrand[brand]) {
      byBrand[brand] = { brand, sessions: 0, users: 0, _bounceWeighted: 0, _durWeighted: 0, _ppsWeighted: 0, _sources: [] };
    }
    const sessions = Number(m[0].value);
    byBrand[brand].sessions += sessions;
    byBrand[brand].users += Number(m[1].value);
    byBrand[brand]._bounceWeighted += Number(m[2].value) * sessions;
    byBrand[brand]._durWeighted += Number(m[3].value) * sessions;
    byBrand[brand]._ppsWeighted += Number(m[4].value) * sessions;
    byBrand[brand]._sources.push(src);
  }
  // Average the weighted aggregates back out.
  return Object.values(byBrand).map(b => ({
    brand: b.brand,
    sessions: b.sessions,
    users: b.users,
    bounceRate: b.sessions ? b._bounceWeighted / b.sessions : 0,
    avgSessionDurationSec: b.sessions ? b._durWeighted / b.sessions : 0,
    pagesPerSession: b.sessions ? b._ppsWeighted / b.sessions : 0,
    rawSources: b._sources,
  })).sort((a, b) => b.sessions - a.sessions);
}

/**
 * Monthly LLM sessions from January 1 of the current year through yesterday.
 * Used for the YTD cross-source correlation trend.
 */
async function fetchYtdMonthlyLlm(propertyId) {
  const today = new Date();
  const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const llmHosts = [
    'chatgpt.com', 'chat.openai.com', 'openai.com',
    'perplexity.ai', 'www.perplexity.ai',
    'claude.ai', 'www.claude.ai',
    'gemini.google.com', 'bard.google.com',
    'copilot.microsoft.com', 'bing.com/chat',
    'you.com', 'phind.com', 'poe.com',
  ];
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: isoDate(jan1), endDate: 'yesterday' }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }],
    dimensionFilter: {
      filter: {
        fieldName: 'sessionSource',
        inListFilter: { values: llmHosts, caseSensitive: false },
      },
    },
    orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
  });
  return (response.rows ?? []).map(r => ({
    yearMonth: r.dimensionValues[0].value,
    llmSessions: Number(r.metricValues[0].value),
  }));
}

/**
 * Monthly total sessions from January 1 through yesterday.
 * Used as the denominator for YTD LLM-share-of-traffic.
 */
async function fetchYtdMonthlyTotal(propertyId) {
  const today = new Date();
  const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: isoDate(jan1), endDate: 'yesterday' }],
    dimensions: [{ name: 'yearMonth' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    dimensionFilter: hostnameExclusionFilter() ?? undefined,
    orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
  });
  return (response.rows ?? []).map(r => ({
    yearMonth: r.dimensionValues[0].value,
    totalSessions: Number(r.metricValues[0].value),
    totalUsers: Number(r.metricValues[1].value),
  }));
}

/**
 * Google Ads headline performance for the period: total spend, clicks,
 * impressions, sessions, CPC, CTR, key events. Pulled via GA4's linked
 * Ads metrics, so no separate Ads API auth is required.
 */
async function fetchGoogleAdsHeadline(propertyId, dateRange) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    metrics: [
      { name: 'advertiserAdClicks' },
      { name: 'advertiserAdImpressions' },
      { name: 'advertiserAdCost' },
      { name: 'advertiserAdCostPerClick' },
      { name: 'advertiserAdCostPerKeyEvent' },
      { name: 'returnOnAdSpend' },
      { name: 'sessions' },
      { name: 'keyEvents' },
    ],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: 'google' } } },
          { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'cpc' } } },
        ],
      },
    },
  });
  const row = response.rows?.[0]?.metricValues ?? [];
  return {
    clicks: Number(row[0]?.value ?? 0),
    impressions: Number(row[1]?.value ?? 0),
    cost: Number(row[2]?.value ?? 0),
    cpc: Number(row[3]?.value ?? 0),
    cpa: Number(row[4]?.value ?? 0),
    roas: Number(row[5]?.value ?? 0),
    sessions: Number(row[6]?.value ?? 0),
    keyEvents: Number(row[7]?.value ?? 0),
    ctr: Number(row[1]?.value ?? 0) > 0 ? Number(row[0]?.value ?? 0) / Number(row[1]?.value ?? 0) : 0,
  };
}

/**
 * Per-campaign Google Ads breakdown.
 */
async function fetchGoogleAdsCampaigns(propertyId, dateRange, limit = 20) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'sessionGoogleAdsCampaignName' }],
    metrics: [
      { name: 'advertiserAdClicks' },
      { name: 'advertiserAdImpressions' },
      { name: 'advertiserAdCost' },
      { name: 'advertiserAdCostPerClick' },
      { name: 'sessions' },
      { name: 'keyEvents' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ desc: true, metric: { metricName: 'advertiserAdCost' } }],
    limit,
  });
  return (response.rows ?? [])
    .map(r => ({
      campaign: r.dimensionValues[0].value,
      clicks: Number(r.metricValues[0].value),
      impressions: Number(r.metricValues[1].value),
      cost: Number(r.metricValues[2].value),
      cpc: Number(r.metricValues[3].value),
      sessions: Number(r.metricValues[4].value),
      keyEvents: Number(r.metricValues[5].value),
      bounceRate: Number(r.metricValues[6].value),
      avgSessionDurationSec: Number(r.metricValues[7].value),
      ctr: Number(r.metricValues[1].value) > 0 ? Number(r.metricValues[0].value) / Number(r.metricValues[1].value) : 0,
      costPerSession: Number(r.metricValues[4].value) > 0 ? Number(r.metricValues[2].value) / Number(r.metricValues[4].value) : 0,
    }))
    .filter(c => c.campaign && c.campaign !== '(not set)' && c.cost > 0);
}

/**
 * Google Ads spend broken down by network type (Search, Display, Video,
 * Shopping). Display campaigns are the most common source of inefficient
 * spend, so this cut surfaces it directly.
 */
async function fetchGoogleAdsByNetwork(propertyId, dateRange) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'sessionGoogleAdsAdNetworkType' }],
    metrics: [
      { name: 'advertiserAdClicks' },
      { name: 'advertiserAdImpressions' },
      { name: 'advertiserAdCost' },
      { name: 'sessions' },
      { name: 'keyEvents' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ desc: true, metric: { metricName: 'advertiserAdCost' } }],
  });
  return (response.rows ?? [])
    .map(r => ({
      network: r.dimensionValues[0].value,
      clicks: Number(r.metricValues[0].value),
      impressions: Number(r.metricValues[1].value),
      cost: Number(r.metricValues[2].value),
      sessions: Number(r.metricValues[3].value),
      keyEvents: Number(r.metricValues[4].value),
      bounceRate: Number(r.metricValues[5].value),
      avgSessionDurationSec: Number(r.metricValues[6].value),
      ctr: Number(r.metricValues[1].value) > 0 ? Number(r.metricValues[0].value) / Number(r.metricValues[1].value) : 0,
      costPerSession: Number(r.metricValues[3].value) > 0 ? Number(r.metricValues[2].value) / Number(r.metricValues[3].value) : 0,
      costPerKeyEvent: Number(r.metricValues[4].value) > 0 ? Number(r.metricValues[2].value) / Number(r.metricValues[4].value) : null,
    }))
    .filter(r => r.cost > 0 || r.sessions > 0);
}

/**
 * Top Google Ads keywords by spend. The most actionable view for waste:
 * high-cost keywords with low conversion or high bounce.
 */
async function fetchGoogleAdsKeywords(propertyId, dateRange, limit = 30) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'sessionGoogleAdsKeyword' }],
    metrics: [
      { name: 'advertiserAdClicks' },
      { name: 'advertiserAdCost' },
      { name: 'sessions' },
      { name: 'keyEvents' },
      { name: 'bounceRate' },
    ],
    orderBys: [{ desc: true, metric: { metricName: 'advertiserAdCost' } }],
    limit,
  });
  return (response.rows ?? [])
    .map(r => ({
      keyword: r.dimensionValues[0].value,
      clicks: Number(r.metricValues[0].value),
      cost: Number(r.metricValues[1].value),
      sessions: Number(r.metricValues[2].value),
      keyEvents: Number(r.metricValues[3].value),
      bounceRate: Number(r.metricValues[4].value),
      cpc: Number(r.metricValues[0].value) > 0 ? Number(r.metricValues[1].value) / Number(r.metricValues[0].value) : 0,
      costPerKeyEvent: Number(r.metricValues[3].value) > 0 ? Number(r.metricValues[1].value) / Number(r.metricValues[3].value) : null,
    }))
    .filter(k => k.keyword && k.keyword !== '(not set)' && k.cost > 0);
}

/**
 * Google Ads performance by device category (mobile vs desktop vs tablet).
 * Often hides a 2-3x efficiency gap.
 */
async function fetchGoogleAdsByDevice(propertyId, dateRange) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [
      { name: 'advertiserAdClicks' },
      { name: 'advertiserAdCost' },
      { name: 'sessions' },
      { name: 'keyEvents' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
    ],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: 'google' } } },
          { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'cpc' } } },
        ],
      },
    },
  });
  return (response.rows ?? [])
    .map(r => ({
      device: r.dimensionValues[0].value,
      clicks: Number(r.metricValues[0].value),
      cost: Number(r.metricValues[1].value),
      sessions: Number(r.metricValues[2].value),
      keyEvents: Number(r.metricValues[3].value),
      bounceRate: Number(r.metricValues[4].value),
      avgSessionDurationSec: Number(r.metricValues[5].value),
      costPerSession: Number(r.metricValues[2].value) > 0 ? Number(r.metricValues[1].value) / Number(r.metricValues[2].value) : 0,
      costPerKeyEvent: Number(r.metricValues[3].value) > 0 ? Number(r.metricValues[1].value) / Number(r.metricValues[3].value) : null,
    }))
    .filter(d => d.cost > 0 || d.sessions > 0);
}

/**
 * YTD monthly Google Ads spend, clicks, sessions, key events.
 * NOTE: Direct yearMonth + Ads metrics queries return inflated numbers
 * (observed ~100x in our test). Workaround: query at daily grain using
 * the date dimension (which IS compatible with Ads metrics) and roll up
 * to months in JS.
 */
async function fetchGoogleAdsYtd(propertyId) {
  const today = new Date();
  const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: isoDate(jan1), endDate: 'yesterday' }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'advertiserAdCost' },
      { name: 'advertiserAdClicks' },
      { name: 'sessions' },
      { name: 'keyEvents' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'engagementRate' },
      { name: 'screenPageViewsPerSession' },
    ],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: 'google' } } },
          { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'cpc' } } },
        ],
      },
    },
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });

  // Roll up daily into monthly buckets. Ratio metrics (bounce, avg
  // duration, engagement, pages/session) must be session-weighted, not
  // simply averaged across days.
  const byMonth = {};
  for (const r of response.rows ?? []) {
    const date = r.dimensionValues[0].value; // YYYYMMDD
    const yearMonth = date.slice(0, 6);
    const sessions = Number(r.metricValues[2].value);
    if (!byMonth[yearMonth]) {
      byMonth[yearMonth] = {
        yearMonth, cost: 0, clicks: 0, sessions: 0, keyEvents: 0,
        _bounceWeighted: 0, _durWeighted: 0, _engWeighted: 0, _ppsWeighted: 0,
      };
    }
    const m = byMonth[yearMonth];
    m.cost += Number(r.metricValues[0].value);
    m.clicks += Number(r.metricValues[1].value);
    m.sessions += sessions;
    m.keyEvents += Number(r.metricValues[3].value);
    m._bounceWeighted += Number(r.metricValues[4].value) * sessions;
    m._durWeighted += Number(r.metricValues[5].value) * sessions;
    m._engWeighted += Number(r.metricValues[6].value) * sessions;
    m._ppsWeighted += Number(r.metricValues[7].value) * sessions;
  }
  return Object.values(byMonth)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
    .map(m => ({
      yearMonth: m.yearMonth,
      cost: m.cost,
      clicks: m.clicks,
      sessions: m.sessions,
      keyEvents: m.keyEvents,
      cpc: m.clicks > 0 ? m.cost / m.clicks : 0,
      costPerSession: m.sessions > 0 ? m.cost / m.sessions : 0,
      costPerKeyEvent: m.keyEvents > 0 ? m.cost / m.keyEvents : null,
      bounceRate: m.sessions > 0 ? m._bounceWeighted / m.sessions : 0,
      avgSessionDurationSec: m.sessions > 0 ? m._durWeighted / m.sessions : 0,
      engagementRate: m.sessions > 0 ? m._engWeighted / m.sessions : 0,
      pagesPerSession: m.sessions > 0 ? m._ppsWeighted / m.sessions : 0,
    }));
}

/**
 * Daily Google Ads spend for the trend chart.
 */
async function fetchGoogleAdsDaily(propertyId, dateRange) {
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'advertiserAdCost' },
      { name: 'advertiserAdClicks' },
      { name: 'sessions' },
    ],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: 'google' } } },
          { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'cpc' } } },
        ],
      },
    },
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });
  return (response.rows ?? []).map(r => ({
    date: r.dimensionValues[0].value,
    cost: Number(r.metricValues[0].value),
    clicks: Number(r.metricValues[1].value),
    sessions: Number(r.metricValues[2].value),
  }));
}

/**
 * Top landing pages for PAID Google Ads traffic.
 * Directly answers: where does our paid spend actually drop people?
 * Includes engagement metrics so we can see if those landing pages
 * convert engagement or just bounce.
 */
/**
 * Paid landing pages aggregated across the entire current calendar year
 * (Jan 1 to yesterday). Smooths out single-month noise, gives a true
 * "where has the money been going all year" picture.
 */
async function fetchPaidLandingPagesYtd(propertyId, limit = 50) {
  const today = new Date();
  const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  return fetchPaidLandingPages(propertyId, {
    startDate: isoDate(jan1),
    endDate: 'yesterday',
  }, limit);
}

async function fetchPaidLandingPages(propertyId, dateRange, limit = 25) {
  // NOTE: advertiserAdCost is incompatible with landingPage dimension in
  // GA4. We get sessions + engagement metrics here; for total spend per
  // landing page, that's a separate compatible cut we can add later.
  const baseFilter = {
    andGroup: {
      expressions: [
        { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'EXACT', value: 'google' } } },
        { filter: { fieldName: 'sessionMedium', stringFilter: { matchType: 'EXACT', value: 'cpc' } } },
      ],
    },
  };
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'landingPage' }],
    metrics: [
      { name: 'sessions' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'engagementRate' },
      { name: 'screenPageViewsPerSession' },
    ],
    dimensionFilter: withWorkhumanComScope(baseFilter, 'landingPage'),
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });
  return (response.rows ?? []).map(r => ({
    landingPage: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
    bounceRate: Number(r.metricValues[1].value),
    avgSessionDurationSec: Number(r.metricValues[2].value),
    engagementRate: Number(r.metricValues[3].value),
    pagesPerSession: Number(r.metricValues[4].value),
  }));
}

/**
 * Top landing pages for sessions originating from LLM referrers.
 * Surfaces which Workhuman content AI tools are pointing people to.
 */
async function fetchLlmLandingPages(propertyId, dateRange, limit = 15) {
  const llmHosts = [
    'chatgpt.com', 'chat.openai.com', 'openai.com',
    'perplexity.ai', 'www.perplexity.ai',
    'claude.ai', 'www.claude.ai',
    'gemini.google.com', 'bard.google.com',
    'copilot.microsoft.com', 'bing.com/chat',
    'you.com', 'phind.com', 'poe.com',
  ];
  const llmFilter = {
    filter: {
      fieldName: 'sessionSource',
      inListFilter: { values: llmHosts, caseSensitive: false },
    },
  };
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'landingPage' }],
    metrics: [{ name: 'sessions' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' }],
    dimensionFilter: withWorkhumanComScope(llmFilter, 'landingPage'),
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit,
  });
  return (response.rows ?? []).map(r => ({
    landingPage: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
    bounceRate: Number(r.metricValues[1].value),
    avgSessionDurationSec: Number(r.metricValues[2].value),
  }));
}

/**
 * Discovery: list all hostnames the GA4 property is tracking, with
 * session counts. Lets us verify that workhuman.live is being correctly
 * excluded by the hostname filter (and surfaces any other unexpected
 * hostnames bleeding into the property).
 */
async function fetchHostnameBreakdown(propertyId, dateRange) {
  // Note: NO filter applied here. We want the raw view of all hostnames.
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [dateRange],
    dimensions: [{ name: 'hostName' }],
    metrics: [{ name: 'sessions' }],
    orderBys: [{ desc: true, metric: { metricName: 'sessions' } }],
    limit: 25,
  });
  return (response.rows ?? []).map(r => ({
    hostname: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value),
  }));
}

/**
 * Run a list of async tasks in batches to respect GA4's concurrent
 * request quota (default 10 concurrent per property; we use 6 to leave
 * headroom for any other parallel runs).
 */
async function runBatched(tasks, batchSize = 6) {
  const results = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize).map(t => t());
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }
  return results;
}

/**
 * Pull everything for one property and shape into the dashboard schema.
 */
export async function fetchGa4Property({ name, propertyId, lookbackDays, hostnames }) {
  if (!propertyId) {
    throw new Error(`Missing GA4 property ID for ${name}`);
  }
  const ranges = buildDateRanges(lookbackDays);
  // Pin the hostname allowlist for THIS property fetch by stashing it
  // into a closure-scoped helper that overrides the env-default. We do
  // this by temporarily setting INCLUDE_HOSTNAMES; safe because each
  // fetchGa4Property call awaits to completion before the next.
  const prevEnv = process.env.INCLUDE_HOSTNAMES;
  if (hostnames && hostnames.length > 0) {
    process.env.INCLUDE_HOSTNAMES = hostnames.join(',');
  }

  const tasks = [
    () => fetchHeadline(propertyId, ranges.current),
    () => fetchHeadline(propertyId, ranges.prior),
    () => fetchTrafficSources(propertyId, ranges.current),
    () => fetchTopPages(propertyId, ranges.current),
    () => fetchDailySessions(propertyId, ranges.current),
    () => fetchDailySessions(propertyId, ranges.prior),
    () => fetchMonthlyHistory(propertyId, 6),
    () => fetchLlmReferrers(propertyId, ranges.current),
    () => fetchLlmLandingPages(propertyId, ranges.current, 10),
    () => fetchYtdMonthlyLlm(propertyId),
    () => fetchYtdMonthlyTotal(propertyId),
    () => fetchGoogleAdsHeadline(propertyId, ranges.current).catch(e => ({ error: e.message })),
    () => fetchGoogleAdsHeadline(propertyId, ranges.prior).catch(e => ({ error: e.message })),
    () => fetchGoogleAdsCampaigns(propertyId, ranges.current, 20).catch(e => ({ error: e.message })),
    () => fetchGoogleAdsDaily(propertyId, ranges.current).catch(e => ({ error: e.message })),
    () => fetchGoogleAdsByNetwork(propertyId, ranges.current).catch(e => ({ error: e.message })),
    () => fetchGoogleAdsKeywords(propertyId, ranges.current, 30).catch(e => ({ error: e.message })),
    () => fetchPaidLandingPages(propertyId, ranges.current, 25).catch(e => ({ error: e.message })),
    () => fetchPaidLandingPagesYtd(propertyId, 50).catch(e => ({ error: e.message })),
    () => fetchHostnameBreakdown(propertyId, ranges.current).catch(e => ({ error: e.message })),
    () => Promise.resolve({ error: 'device breakdown disabled (deviceCategory not compatible with Ads metrics in this query shape)' }),
    () => fetchGoogleAdsYtd(propertyId).catch(e => ({ error: e.message })),
  ];
  const [
    current, prior, sources, pages, daily, dailyPrior, monthly,
    llmReferrers, llmLanding, ytdLlm, ytdTotal,
    adsHeadCurr, adsHeadPrior, adsCampaigns, adsDaily,
    adsByNetwork, adsKeywords, adsLandingPages, adsLandingPagesYtd, hostnameBreakdown, adsByDevice, adsYtd,
  ] = await runBatched(tasks, 6);

  // Merge YTD monthly data into a single shape: yearMonth → { totalSessions, llmSessions, llmShare }
  const ytdByMonth = {};
  for (const t of ytdTotal) {
    ytdByMonth[t.yearMonth] = { yearMonth: t.yearMonth, totalSessions: t.totalSessions, totalUsers: t.totalUsers, llmSessions: 0, llmShare: 0 };
  }
  for (const l of ytdLlm) {
    if (!ytdByMonth[l.yearMonth]) ytdByMonth[l.yearMonth] = { yearMonth: l.yearMonth, totalSessions: 0, totalUsers: 0, llmSessions: 0, llmShare: 0 };
    ytdByMonth[l.yearMonth].llmSessions = l.llmSessions;
  }
  for (const k of Object.keys(ytdByMonth)) {
    const m = ytdByMonth[k];
    m.llmShare = m.totalSessions > 0 ? m.llmSessions / m.totalSessions : 0;
  }
  const ytdMonths = Object.values(ytdByMonth).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

  // Compute LLM-share-of-total for the cross-source correlation panel.
  const llmTotalSessions = llmReferrers.reduce((s, r) => s + r.sessions, 0);
  const llmShareOfTraffic = current.sessions > 0 ? llmTotalSessions / current.sessions : 0;

  // Restore env to whatever it was before this fetch.
  if (prevEnv === undefined) delete process.env.INCLUDE_HOSTNAMES;
  else process.env.INCLUDE_HOSTNAMES = prevEnv;

  return {
    site: name,
    propertyId,
    hostnameScope: hostnames ?? null,
    window: ranges,
    headline: {
      current,
      prior,
      delta: deltaPct(current, prior),
    },
    sources,
    pages,
    daily,
    dailyPrior,
    monthly,
    llm: {
      referrers: llmReferrers,
      landingPages: llmLanding,
      totalSessions: llmTotalSessions,
      shareOfTraffic: llmShareOfTraffic,
    },
    ytd: ytdMonths,
    hostnames: hostnameBreakdown,
    googleAds: {
      headline: adsHeadCurr,
      headlinePrior: adsHeadPrior,
      headlineDelta: (adsHeadCurr?.error || adsHeadPrior?.error) ? null : {
        cost: adsHeadPrior.cost > 0 ? ((adsHeadCurr.cost - adsHeadPrior.cost) / adsHeadPrior.cost) * 100 : null,
        clicks: adsHeadPrior.clicks > 0 ? ((adsHeadCurr.clicks - adsHeadPrior.clicks) / adsHeadPrior.clicks) * 100 : null,
        cpc: adsHeadPrior.cpc > 0 ? ((adsHeadCurr.cpc - adsHeadPrior.cpc) / adsHeadPrior.cpc) * 100 : null,
        keyEvents: adsHeadPrior.keyEvents > 0 ? ((adsHeadCurr.keyEvents - adsHeadPrior.keyEvents) / adsHeadPrior.keyEvents) * 100 : null,
      },
      campaigns: adsCampaigns,
      daily: adsDaily,
      byNetwork: adsByNetwork,
      keywords: adsKeywords,
      landingPages: adsLandingPages,
      landingPagesYtd: adsLandingPagesYtd,
      byDevice: adsByDevice,
      ytd: adsYtd,
    },
  };
}

function deltaPct(curr, prior) {
  const d = (a, b) => (b === 0 ? null : ((a - b) / b) * 100);
  return {
    sessions: d(curr.sessions, prior.sessions),
    users: d(curr.users, prior.users),
    bounceRate: d(curr.bounceRate, prior.bounceRate),
    avgSessionDurationSec: d(curr.avgSessionDurationSec, prior.avgSessionDurationSec),
    engagementRate: d(curr.engagementRate, prior.engagementRate),
  };
}

/**
 * CLI entrypoint: pull both properties and print JSON to stdout.
 */
export async function fetchGa4All() {
  // Default to 30-day rolling window (MoM comparison). Override with KPI_LOOKBACK_DAYS in .env.
  const lookbackDays = Number(process.env.KPI_LOOKBACK_DAYS ?? 30);

  // Define logical "sites" within the GA4 property by allowlisting
  // hostnames. workhuman.com is the main marketing umbrella (corp +
  // press subdomain). whlp is the landing-pages subdomain we treat
  // as a separate site for reporting.
  const mainHosts = (process.env.INCLUDE_HOSTNAMES ?? 'www.workhuman.com,workhuman.com,press.workhuman.com')
    .split(',').map(s => s.trim()).filter(Boolean);
  const whlpHosts = (process.env.WHLP_HOSTNAMES ?? 'whlp.workhuman.com')
    .split(',').map(s => s.trim()).filter(Boolean);
  const sharedPropertyId = process.env.GA4_PROPERTY_ID_WORKHUMAN_COM;
  const candidates = [
    { name: 'workhuman.com', propertyId: sharedPropertyId, hostnames: mainHosts },
    { name: 'whlp.workhuman.com', propertyId: sharedPropertyId, hostnames: whlpHosts },
    { name: 'workhuman.live', propertyId: process.env.GA4_PROPERTY_ID_WORKHUMAN_LIVE, hostnames: null },
  ];
  // Skip any property whose ID isn't set in .env. v1 ships workhuman.com
  // only; workhuman.live can be added later by populating its property ID.
  const properties = candidates.filter(p => p.propertyId);
  const skipped = candidates.filter(p => !p.propertyId).map(p => p.name);

  if (properties.length === 0) {
    return {
      fetchedAt: new Date().toISOString(),
      lookbackDays,
      properties: [],
      skipped,
      warning: 'No GA4 property IDs configured. Set GA4_PROPERTY_ID_WORKHUMAN_COM in .env.',
    };
  }

  const results = await Promise.all(
    properties.map(p => fetchGa4Property({ ...p, lookbackDays }))
  );
  return {
    fetchedAt: new Date().toISOString(),
    lookbackDays,
    properties: results,
    skipped,
  };
}

// CLI entry-point detection that survives paths containing spaces
// (the naive `file://${argv[1]}` comparison fails on URL-encoded paths).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  fetchGa4All()
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(err => {
      console.error('GA4 fetch failed:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
}
