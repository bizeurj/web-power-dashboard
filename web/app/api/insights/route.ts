import { NextResponse, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { readLatestSnapshot } from '@/lib/storage';
import { summarizeSnapshot } from '@/lib/snapshot-summary';
import type { Snapshot } from '@/lib/snapshot-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are an executive analyst writing a 3-bullet daily intelligence brief for a Senior Director of Web Development & Creative Marketing at Workhuman.

Style guidelines:
- McKinsey-deck framing: each bullet starts with the observation, follows with a one-line "Why it matters" and one-line "Suggested action" if relevant.
- Be specific: cite actual numbers from the data.
- Skip platitudes. If nothing meaningful changed, say so plainly rather than inventing significance.
- Treat AI search citations as influence compounding (a leading indicator), not a click-conversion channel.
- Never use em-dashes or "not X, but Y" antithetical parallelism.

Return EXACTLY this JSON shape:
{
  "generatedAt": "<ISO timestamp>",
  "observations": [
    { "headline": "<one-line observation>", "detail": "<2-3 sentences>", "severity": "good"|"warn"|"info"|"bad", "metric": "<short metric name>" }
  ],
  "summary": "<single sentence top-line>"
}
No prose outside the JSON. 3 to 5 observations.`;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'Insights disabled',
        detail: 'Set ANTHROPIC_API_KEY in Vercel project env vars to enable LLM insights.',
      },
      { status: 503 }
    );
  }

  const snapshot = (await readLatestSnapshot()) as Snapshot | null;
  if (!snapshot) {
    return NextResponse.json({ error: 'No snapshot available' }, { status: 404 });
  }

  const tab = req.nextUrl.searchParams.get('tab') || 'overview';
  const summary = summarizeSnapshot(snapshot, tab);

  const userPrompt = `Tab context: ${tab}
Snapshot summary (JSON):
${JSON.stringify(summary)}

Produce the 3-5 observations for this tab. If tab=overview, mix observations across channels. If tab=traffic, focus on GA4 sessions and source mix. If tab=paid, focus on Google Ads efficiency. If tab=ai, focus on Profound visibility and LLM referral traffic. If tab=content, focus on top-performing pages and content gaps.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Claude API error', status: res.status, detail: text.slice(0, 500) },
        { status: 502 }
      );
    }

    const body = await res.json();
    const text = body?.content?.[0]?.text || '';

    // Strip any markdown fences Claude sometimes adds despite the prompt.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'Could not parse LLM JSON', raw: cleaned.slice(0, 500) }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Insights call failed', detail: message }, { status: 500 });
  }
}
