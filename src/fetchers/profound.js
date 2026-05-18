// ---------------------------------------------------------------
// Profound fetcher
// Pulls AI search visibility metrics (visibility score, share of voice,
// citations, top prompts) for tracked Workhuman domains.
//
// Notes:
//   - REST API base is api.tryprofound.com (TBC; verify on first run)
//   - Auth: bearer token in `Authorization: Bearer <key>` header
//   - Rate limit: 600 req/hr per key (we do at most ~10 calls per run)
//   - Endpoint shapes are based on docs.tryprofound.com search results;
//     refine these once we probe with the real API key in hand.
// ---------------------------------------------------------------

import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.tryprofound.com';

class ProfoundClient {
  constructor(apiKey, orgId) {
    if (!apiKey) throw new Error('Missing PROFOUND_API_KEY');
    this.apiKey = apiKey;
    this.orgId = orgId;
  }

  async request(method, path, { params = {}, body = null } = {}) {
    const url = new URL(BASE + path);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
    const res = await fetch(url, {
      method,
      headers: {
        // Profound uses X-API-Key (NOT Authorization: Bearer). Confirmed via
        // their docs: docs.tryprofound.com/rest-api/authentication.
        'X-API-Key': this.apiKey,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Profound ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  get(path, params) {
    return this.request('GET', path, { params });
  }
  post(path, body, params) {
    return this.request('POST', path, { params, body });
  }

  // --- High-level pulls --------------------------------------------------

  /**
   * Org-level metadata. Useful as an auth sanity-check.
   * Returns an array of orgs the API key has access to.
   */
  async getOrg() {
    return this.get('/v1/org');
  }

  /**
   * List categories (industry segments) configured for the org.
   * Confirmed endpoint per profoundai SDK: GET /v1/org/categories.
   */
  async getCategories() {
    return this.get('/v1/org/categories');
  }

  /**
   * Get configured assets (the brands/sites tracked across all categories).
   * Useful for surfacing Workhuman's own asset_id.
   */
  async getAssets() {
    return this.get('/v1/org/assets');
  }

  /**
   * Visibility report for a category and date window.
   * Schema confirmed against profoundai TypeScript SDK (resources/reports.d.ts).
   *
   * Valid metrics: share_of_voice, visibility_score, mentions_count,
   * executions, average_position.
   * Valid dimensions: date, region, topic, topic_id, model, asset_id,
   * asset_name, prompt, prompt_id, tag, persona.
   *
   * NOTE: there is no `domains` body field. Filter by asset_name via the
   * `filters` array if you need to scope to a single brand.
   */
  async getVisibility({ categoryId, startDate, endDate, limit = 50 } = {}) {
    return this.post('/v1/reports/visibility', {
      category_id: categoryId,
      metrics: ['share_of_voice', 'visibility_score', 'mentions_count', 'average_position'],
      dimensions: ['asset_name'],
      start_date: startDate,
      end_date: endDate,
      // Sort by visibility_score so we get the top of the leaderboard.
      // Keeps snapshot.json compact (default unsorted query returned ~12k rows).
      order_by: { visibility_score: 'desc' },
      pagination: { limit, offset: 0 },
    });
  }

  /**
   * Citations report. Per profoundai SDK, valid metrics include:
   * 'count' | 'citation_share' | 'share_of_voice'.
   * Dimensions can include citation_url, citation_domain, prompt, model,
   * asset_name, date.
   *
   * We use this for three Content tab cuts:
   *   - by citation_url + asset_name → which Workhuman pages are cited
   *   - by citation_domain → which sites are winning citations overall
   *   - by prompt → what AI queries surface HR Tech content
   *   - by model → which AI engines cite us
   */
  async getCitations({ categoryId, startDate, endDate, dimensions, limit = 50, filters } = {}) {
    return this.post('/v1/reports/citations', {
      category_id: categoryId,
      metrics: ['count', 'citation_share'],
      dimensions: dimensions ?? ['citation_domain'],
      start_date: startDate,
      end_date: endDate,
      order_by: { count: 'desc' },
      pagination: { limit, offset: 0 },
      filters: filters ?? undefined,
    });
  }

  /**
   * List topics for a category. Topics group prompts together so we can
   * see which content themes are trending in AI search.
   */
  async getTopics(categoryId) {
    return this.get(`/v1/org/categories/${categoryId}/topics`);
  }

  /**
   * Monthly visibility for a single asset (e.g. Workhuman) from a start
   * date through end date, bucketed by month. Used for the YTD trend.
   */
  async getMonthlyAssetVisibility({ categoryId, assetName, startDate, endDate } = {}) {
    return this.post('/v1/reports/visibility', {
      category_id: categoryId,
      metrics: ['share_of_voice', 'visibility_score', 'mentions_count', 'average_position'],
      dimensions: ['date', 'asset_name'],
      date_interval: 'month',
      start_date: startDate,
      end_date: endDate,
      filters: [{ field: 'asset_name', operator: 'is', value: assetName }],
      pagination: { limit: 100, offset: 0 },
    });
  }
}

/**
 * Pull a single domain's snapshot.
 * Each call is wrapped in try/catch so one failed sub-call doesn't kill
 * the whole snapshot. We mark missing pieces as null.
 */
function buildDateWindow(days) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  const start = new Date(yesterday);
  start.setUTCDate(yesterday.getUTCDate() - (days - 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: yesterday.toISOString().slice(0, 10),
  };
}

async function fetchDomain(client, domain, days, categoryId) {
  const result = { domain, days, errors: [], categoryId };
  const { startDate, endDate } = buildDateWindow(days);

  if (!categoryId) {
    result.visibility = null;
    result.errors.push({ field: 'visibility', message: 'No categoryId resolved' });
    return result;
  }

  try {
    // Visibility is category-wide and grouped by asset_name, so the
    // returned table includes Workhuman alongside competitor brands in
    // the same category. The renderer will pick out Workhuman's row.
    result.visibility = await client.getVisibility({ categoryId, startDate, endDate });
  } catch (e) {
    result.visibility = null;
    result.errors.push({ field: 'visibility', message: e.message });
  }

  return result;
}

export async function fetchProfoundAll() {
  const apiKey = process.env.PROFOUND_API_KEY;
  const orgId = process.env.PROFOUND_ORG_ID;
  const days = Number(process.env.KPI_LOOKBACK_DAYS ?? 7);
  const domains = (process.env.PROFOUND_DOMAINS ?? 'workhuman.com,workhuman.live')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);

  if (!apiKey) {
    return {
      fetchedAt: new Date().toISOString(),
      skipped: true,
      reason: 'PROFOUND_API_KEY not set',
      domains: [],
    };
  }

  const client = new ProfoundClient(apiKey, orgId);

  let org = null;
  let orgError = null;
  try {
    org = await client.getOrg();
  } catch (e) {
    orgError = e.message;
  }

  // Resolve category id: env override wins, else discover via API.
  let categoryId = process.env.PROFOUND_CATEGORY_ID || null;
  let categories = null;
  let categoriesError = null;
  if (!categoryId) {
    try {
      categories = await client.getCategories();
      // Response shapes seen in the wild: { data: [...] } or just [...]
      const list = Array.isArray(categories) ? categories
        : (Array.isArray(categories?.data) ? categories.data : []);
      categoryId = list[0]?.id ?? list[0]?.category_id ?? null;
    } catch (e) {
      categoriesError = e.message;
    }
  }

  const domainResults = await Promise.all(
    domains.map(d => fetchDomain(client, d, days, categoryId))
  );

  // YTD monthly visibility for Workhuman, Jan 1 of current year through today.
  let ytd = null;
  let ytdError = null;
  if (categoryId) {
    try {
      const today = new Date();
      const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      // Profound requires end_date strictly before today, so use yesterday.
      const yesterday = new Date(today);
      yesterday.setUTCDate(today.getUTCDate() - 1);
      const startDate = jan1.toISOString().slice(0, 10);
      const endDate = yesterday.toISOString().slice(0, 10);
      const ytdResp = await client.getMonthlyAssetVisibility({
        categoryId,
        assetName: 'Workhuman',
        startDate,
        endDate,
      });
      const queryMetrics = ytdResp?.info?.query?.metrics || ['share_of_voice', 'visibility_score', 'mentions_count', 'average_position'];
      // Profound's dimension order in the response isn't guaranteed to match
      // the request order, so detect which value is the date vs asset_name.
      ytd = (ytdResp?.data ?? []).map(r => {
        const obj = {};
        for (const d of r.dimensions) {
          if (/^\d{4}-\d{2}-\d{2}/.test(d)) obj.date = d;
          else obj.asset = d;
        }
        queryMetrics.forEach((m, i) => obj[m] = r.metrics[i]);
        return obj;
      }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    } catch (e) {
      ytdError = e.message;
    }
  }

  // Content-tab data: citations by URL/domain/prompt/model, plus topics.
  // Each call is independent and wrapped so one failure doesn't kill the rest.
  // Now fetches BOTH 30d window AND YTD (Jan 1 to yesterday) so the
  // dashboard can toggle between recent and full-year views.
  const content = {};
  const contentYtd = {};
  if (categoryId) {
    const { startDate, endDate } = buildDateWindow(days);
    // YTD window
    const today = new Date();
    const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const yesterday = new Date(today); yesterday.setUTCDate(today.getUTCDate() - 1);
    const ytdStart = jan1.toISOString().slice(0, 10);
    const ytdEnd = yesterday.toISOString().slice(0, 10);

    const wrap = (target, key, fn) => fn().then(d => target[key] = d).catch(e => target[key] = { error: e.message });

    // The set of citation cuts we want, parameterized by date range.
    // Same shape for 30d window and YTD window.
    function buildCuts(target, sd, ed) {
      return [
        wrap(target, 'topUrls', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['url'], limit: 100 })),
        wrap(target, 'urlsByCategory', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['url', 'citation_category'], limit: 100 })),
        wrap(target, 'urlsByTopic', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['url', 'topic'], limit: 300 })),
        wrap(target, 'domainsByTopic', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['root_domain', 'topic'], limit: 300 })),
        wrap(target, 'promptsByTopic', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['prompt', 'topic'], limit: 300 })),
        wrap(target, 'topDomains', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['root_domain'], limit: 30 })),
        wrap(target, 'topPrompts', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['prompt'], limit: 30 })),
        wrap(target, 'byModel', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['model'], limit: 20 })),
        wrap(target, 'byTopic', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['topic'], limit: 30 })),
        wrap(target, 'byCitationCategory', () => client.getCitations({ categoryId, startDate: sd, endDate: ed, dimensions: ['citation_category'], limit: 20 })),
      ];
    }

    await Promise.all([
      ...buildCuts(content, startDate, endDate),
      ...buildCuts(contentYtd, ytdStart, ytdEnd),
      wrap(content, 'topics', () => client.getTopics(categoryId)),
    ]);
  }

  return {
    fetchedAt: new Date().toISOString(),
    lookbackDays: days,
    org,
    orgError,
    categories,
    categoriesError,
    resolvedCategoryId: categoryId,
    domains: domainResults,
    ytd,
    ytdError,
    content,
    contentYtd,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  fetchProfoundAll()
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(err => {
      console.error('Profound fetch failed:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
}
