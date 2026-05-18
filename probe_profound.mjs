// Probe script: tries multiple Profound endpoint shapes and logs results.
// Run with: node probe_profound.mjs
// Pipe to file: node probe_profound.mjs > probe_output.txt 2>&1
//
// We're testing: citations report (URL-level), prompt dimension on visibility,
// topic and domain breakdowns, and Workhuman-filtered citations.
// Each probe is wrapped so a 404/400 on one doesn't stop the others.

import 'dotenv/config';

const BASE = 'https://api.tryprofound.com';
const apiKey = process.env.PROFOUND_API_KEY;
const categoryId = process.env.PROFOUND_CATEGORY_ID || '835e7547-8216-47e5-9f69-96f6c51bac2f';

if (!apiKey) {
  console.error('PROFOUND_API_KEY missing');
  process.exit(1);
}

async function call(method, path, body = null, params = {}) {
  const url = new URL(BASE + path);
  Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)));
  const res = await fetch(url, {
    method,
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }
  return { status: res.status, ok: res.ok, data };
}

function buildWindow(days = 30) {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setUTCDate(today.getUTCDate() - 1);
  const start = new Date(yesterday); start.setUTCDate(yesterday.getUTCDate() - (days - 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: yesterday.toISOString().slice(0, 10),
  };
}

const { startDate, endDate } = buildWindow(30);
console.log('Window:', startDate, '->', endDate);
console.log('Category ID:', categoryId);

async function probe(label, fn) {
  console.log('\n==========', label, '==========');
  try {
    const r = await fn();
    console.log('Status:', r.status, 'OK:', r.ok);
    const preview = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
    console.log(preview.slice(0, 2500));
    if (preview.length > 2500) console.log('...[truncated]');
  } catch (e) {
    console.log('THREW:', e.message);
  }
}

// 1. Citations report - full URL-level breakdown
await probe('1. POST /v1/reports/citations (basic)', () =>
  call('POST', '/v1/reports/citations', {
    category_id: categoryId,
    start_date: startDate,
    end_date: endDate,
    pagination: { limit: 5, offset: 0 },
  })
);

// 2. Citations with explicit metrics + dimensions
await probe('2. POST /v1/reports/citations (with dimensions)', () =>
  call('POST', '/v1/reports/citations', {
    category_id: categoryId,
    start_date: startDate,
    end_date: endDate,
    metrics: ['citations_count', 'share_of_citations'],
    dimensions: ['url', 'domain'],
    pagination: { limit: 5, offset: 0 },
  })
);

// 3. Visibility with prompt dimension - top prompts in HR Tech
await probe('3. POST /v1/reports/visibility (dimension=prompt)', () =>
  call('POST', '/v1/reports/visibility', {
    category_id: categoryId,
    start_date: startDate,
    end_date: endDate,
    metrics: ['visibility_score', 'mentions_count', 'executions'],
    dimensions: ['prompt'],
    order_by: { mentions_count: 'desc' },
    pagination: { limit: 10, offset: 0 },
  })
);

// 4. Prompts where Workhuman is cited
await probe('4. POST /v1/reports/visibility (prompt + Workhuman filter)', () =>
  call('POST', '/v1/reports/visibility', {
    category_id: categoryId,
    start_date: startDate,
    end_date: endDate,
    metrics: ['visibility_score', 'mentions_count'],
    dimensions: ['prompt', 'asset_name'],
    filters: [{ field: 'asset_name', operator: 'is', value: 'Workhuman' }],
    order_by: { mentions_count: 'desc' },
    pagination: { limit: 10, offset: 0 },
  })
);

// 5. Topic-level visibility
await probe('5. POST /v1/reports/visibility (dimension=topic)', () =>
  call('POST', '/v1/reports/visibility', {
    category_id: categoryId,
    start_date: startDate,
    end_date: endDate,
    metrics: ['visibility_score', 'mentions_count'],
    dimensions: ['topic'],
    order_by: { mentions_count: 'desc' },
    pagination: { limit: 10, offset: 0 },
  })
);

// 6. Citations grouped by domain (3rd-party authority leaderboard)
await probe('6. POST /v1/reports/citations (by domain)', () =>
  call('POST', '/v1/reports/citations', {
    category_id: categoryId,
    start_date: startDate,
    end_date: endDate,
    metrics: ['citations_count'],
    dimensions: ['domain'],
    order_by: { citations_count: 'desc' },
    pagination: { limit: 15, offset: 0 },
  })
);

// 7. Workhuman-only citations (our cited content)
await probe('7. POST /v1/reports/citations (Workhuman URLs only)', () =>
  call('POST', '/v1/reports/citations', {
    category_id: categoryId,
    start_date: startDate,
    end_date: endDate,
    metrics: ['citations_count'],
    dimensions: ['url'],
    filters: [{ field: 'domain', operator: 'is', value: 'workhuman.com' }],
    order_by: { citations_count: 'desc' },
    pagination: { limit: 10, offset: 0 },
  })
);

// 8. Citations by model (which AI tool is citing what)
await probe('8. POST /v1/reports/citations (by model)', () =>
  call('POST', '/v1/reports/citations', {
    category_id: categoryId,
    start_date: startDate,
    end_date: endDate,
    metrics: ['citations_count'],
    dimensions: ['model', 'domain'],
    order_by: { citations_count: 'desc' },
    pagination: { limit: 20, offset: 0 },
  })
);

// 9. Alt path: prompts as their own resource
await probe('9. GET /v1/prompts (alt resource)', () =>
  call('GET', '/v1/prompts', null, { category_id: categoryId, limit: 5 })
);

// 10. Alt path: citations as a list resource
await probe('10. GET /v1/citations (alt resource)', () =>
  call('GET', '/v1/citations', null, { category_id: categoryId, limit: 5 })
);

console.log('\n========== DONE ==========');
