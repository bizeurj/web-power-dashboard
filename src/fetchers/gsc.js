// ---------------------------------------------------------------
// Google Search Console fetcher
// Pulls organic search performance: queries, pages, clicks, impressions,
// CTR, average position. Uses the same service account as GA4.
//
// Auth: service account must be added to the Search Console property
// under Settings > Users and permissions (Restricted/read-only is fine).
//
// Env vars:
//   GOOGLE_APPLICATION_CREDENTIALS  — path to service account JSON
//   GSC_SITE_URL                    — site identifier in GSC, either:
//                                     "sc-domain:workhuman.com" (preferred)
//                                     or "https://www.workhuman.com/"
// ---------------------------------------------------------------

import 'dotenv/config';
import { google } from 'googleapis';
import { fileURLToPath } from 'node:url';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

async function getClient() {
  // GoogleAuth is the recommended high-level abstraction; it handles
  // service-account JWT exchange and surfaces clearer errors when the
  // Search Console API isn't enabled in the GCP project.
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: SCOPES,
  });
  const authClient = await auth.getClient();
  return google.searchconsole({ version: 'v1', auth: authClient });
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

function buildDateRanges(lookbackDays) {
  const today = new Date();
  // GSC has a 2-3 day data lag; end the window 3 days back to be safe.
  const lagEnd = new Date(today);
  lagEnd.setUTCDate(today.getUTCDate() - 3);
  const currentStart = new Date(lagEnd);
  currentStart.setUTCDate(lagEnd.getUTCDate() - (lookbackDays - 1));
  const priorEnd = new Date(currentStart);
  priorEnd.setUTCDate(currentStart.getUTCDate() - 1);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorEnd.getUTCDate() - (lookbackDays - 1));
  return {
    current: { startDate: isoDate(currentStart), endDate: isoDate(lagEnd) },
    prior: { startDate: isoDate(priorStart), endDate: isoDate(priorEnd) },
  };
}

async function gscQuery(client, siteUrl, body) {
  const res = await client.searchanalytics.query({
    siteUrl,
    requestBody: body,
  });
  return res.data;
}

/**
 * Headline totals for a date window.
 * No dimensions = single aggregate row.
 */
async function fetchGscHeadline(client, siteUrl, dateRange) {
  const data = await gscQuery(client, siteUrl, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: [],
    rowLimit: 1,
  });
  const row = data.rows?.[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

/**
 * Top organic search queries by clicks.
 */
async function fetchGscQueries(client, siteUrl, dateRange, limit = 50) {
  const data = await gscQuery(client, siteUrl, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ['query'],
    rowLimit: limit,
  });
  return (data.rows ?? []).map(r => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/**
 * Top pages by clicks.
 */
async function fetchGscPages(client, siteUrl, dateRange, limit = 30) {
  const data = await gscQuery(client, siteUrl, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ['page'],
    rowLimit: limit,
  });
  return (data.rows ?? []).map(r => ({
    page: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/**
 * Device breakdown (mobile/desktop/tablet).
 */
async function fetchGscDevice(client, siteUrl, dateRange) {
  const data = await gscQuery(client, siteUrl, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ['device'],
  });
  return (data.rows ?? []).map(r => ({
    device: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/**
 * Country breakdown (top 15).
 */
async function fetchGscCountry(client, siteUrl, dateRange, limit = 15) {
  const data = await gscQuery(client, siteUrl, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ['country'],
    rowLimit: limit,
  });
  return (data.rows ?? []).map(r => ({
    country: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/**
 * Daily clicks/impressions for the trend chart.
 */
async function fetchGscDaily(client, siteUrl, dateRange) {
  const data = await gscQuery(client, siteUrl, {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    dimensions: ['date'],
    rowLimit: 100,
  });
  return (data.rows ?? [])
    .map(r => ({
      date: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * YTD monthly trend, aggregated from daily.
 * Mirrors the pattern used for Google Ads YTD.
 */
async function fetchGscYtd(client, siteUrl) {
  const today = new Date();
  const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const lagEnd = new Date(today);
  lagEnd.setUTCDate(today.getUTCDate() - 3);
  const data = await gscQuery(client, siteUrl, {
    startDate: isoDate(jan1),
    endDate: isoDate(lagEnd),
    dimensions: ['date'],
    rowLimit: 500,
  });
  const byMonth = {};
  for (const r of data.rows ?? []) {
    const date = r.keys[0]; // YYYY-MM-DD
    const yearMonth = date.slice(0, 4) + date.slice(5, 7); // YYYYMM
    if (!byMonth[yearMonth]) {
      byMonth[yearMonth] = { yearMonth, clicks: 0, impressions: 0, _posWeighted: 0 };
    }
    byMonth[yearMonth].clicks += r.clicks;
    byMonth[yearMonth].impressions += r.impressions;
    byMonth[yearMonth]._posWeighted += (r.position || 0) * (r.impressions || 0);
  }
  return Object.values(byMonth)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
    .map(m => ({
      yearMonth: m.yearMonth,
      clicks: m.clicks,
      impressions: m.impressions,
      ctr: m.impressions > 0 ? m.clicks / m.impressions : 0,
      avgPosition: m.impressions > 0 ? m._posWeighted / m.impressions : 0,
    }));
}

/**
 * Pull the full GSC payload for one site.
 */
export async function fetchGscAll() {
  const siteUrl = process.env.GSC_SITE_URL;
  const lookbackDays = Number(process.env.KPI_LOOKBACK_DAYS ?? 30);
  if (!siteUrl) {
    return {
      fetchedAt: new Date().toISOString(),
      skipped: true,
      reason: 'GSC_SITE_URL not set in .env. Add e.g. GSC_SITE_URL=sc-domain:workhuman.com',
    };
  }
  const client = await getClient();
  const ranges = buildDateRanges(lookbackDays);

  const [headCurr, headPrior, queries, pages, device, country, daily, ytd] = await Promise.all([
    fetchGscHeadline(client, siteUrl, ranges.current).catch(e => ({ error: e.message })),
    fetchGscHeadline(client, siteUrl, ranges.prior).catch(e => ({ error: e.message })),
    fetchGscQueries(client, siteUrl, ranges.current, 50).catch(e => ({ error: e.message })),
    fetchGscPages(client, siteUrl, ranges.current, 30).catch(e => ({ error: e.message })),
    fetchGscDevice(client, siteUrl, ranges.current).catch(e => ({ error: e.message })),
    fetchGscCountry(client, siteUrl, ranges.current, 15).catch(e => ({ error: e.message })),
    fetchGscDaily(client, siteUrl, ranges.current).catch(e => ({ error: e.message })),
    fetchGscYtd(client, siteUrl).catch(e => ({ error: e.message })),
  ]);

  const headlineDelta = (headCurr?.error || headPrior?.error) ? null : {
    clicks: headPrior.clicks > 0 ? ((headCurr.clicks - headPrior.clicks) / headPrior.clicks) * 100 : null,
    impressions: headPrior.impressions > 0 ? ((headCurr.impressions - headPrior.impressions) / headPrior.impressions) * 100 : null,
    ctr: headPrior.ctr > 0 ? ((headCurr.ctr - headPrior.ctr) / headPrior.ctr) * 100 : null,
    position: headPrior.position > 0 ? ((headCurr.position - headPrior.position) / headPrior.position) * 100 : null,
  };

  return {
    fetchedAt: new Date().toISOString(),
    siteUrl,
    lookbackDays,
    window: ranges,
    headline: headCurr,
    headlinePrior: headPrior,
    headlineDelta,
    queries,
    pages,
    device,
    country,
    daily,
    ytd,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  fetchGscAll()
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(err => {
      console.error('GSC fetch failed:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
}
