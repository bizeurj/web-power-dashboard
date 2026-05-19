'use client';

import { Snapshot, getGa4, getProfound, getGsc, getMainProperty, asArray } from '@/lib/snapshot-types';
import { fmt, fmtPct, fmtSec, fmtMoney, fixed } from '@/lib/format';
import { Card, ExecIntro, Insight, SectionTitle } from '@/components/shared/Card';
import { KpiCard, KpiRow } from '@/components/shared/KpiCard';
import { LineSeries, PALETTE } from '@/components/shared/Charts';

export function OverviewTab({ snapshot }: { snapshot: Snapshot }) {
  const ga4 = getGa4(snapshot);
  const profound = getProfound(snapshot);
  const gsc = getGsc(snapshot);
  const wh = getMainProperty(ga4);

  if (!wh) {
    return <Card title="Overview">GA4 data not available in this snapshot.</Card>;
  }

  const head = wh.headline || { current: {} as Record<string, number>, prior: {} as Record<string, number>, delta: {} as Record<string, number> };
  const hCur = (head.current || {}) as Partial<Record<'sessions' | 'users' | 'bounceRate' | 'avgSessionDurationSec' | 'engagementRate' | 'pagesPerSession', number>>;
  const hDelta = (head.delta || {}) as Partial<Record<string, number>>;
  const llmSessions = wh.llm?.totalSessions ?? 0;
  const llmShare = wh.llm?.shareOfTraffic ?? 0;
  const ads = wh.googleAds?.headline;

  const topDomains = asArray<[string, number, string?]>(profound?.content?.topDomains);
  const profoundWh = topDomains.find(
    (d) => Array.isArray(d) && typeof d[0] === 'string' && d[0].toLowerCase().includes('workhuman')
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExecIntro>
        <strong>This is your snapshot of how workhuman.com is performing today across the four channels that actually matter for growth.</strong>{' '}
        Last 30 days versus the prior 30. Web traffic, paid efficiency, AI-search visibility, and organic search are stitched into a single view so you can see when one channel compensates for or undercuts another.
      </ExecIntro>

      <Card title="Workhuman.com — last 30 days" domain={wh.site}>
        <KpiRow cols={4}>
          <KpiCard
            label="Sessions"
            value={fmt(hCur.sessions)}
            delta={hDelta.sessions}
            hero="purple"
          />
          <KpiCard
            label="Users"
            value={fmt(hCur.users)}
            delta={hDelta.users}
          />
          <KpiCard
            label="Avg session"
            value={fmtSec(hCur.avgSessionDurationSec)}
            delta={hDelta.avgSessionDurationSec}
          />
          <KpiCard
            label="Bounce rate"
            value={fmtPct(hCur.bounceRate)}
            delta={hDelta.bounceRate}
            deltaLowerIsBetter
          />
        </KpiRow>

        <SectionTitle>30-day session trend (vs prior period)</SectionTitle>
        <LineSeries
          labels={asArray<number>(wh.daily).map((_, i) => `D${i + 1}`)}
          series={[
            { name: 'Last 30d', data: asArray<number>(wh.daily), color: PALETTE.primary, fill: true },
            { name: 'Prior 30d', data: asArray<number>(wh.dailyPrior), color: PALETTE.neutral },
          ]}
          height={220}
          yFormatter={(n) => fmt(n)}
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Card title="Organic search" accent="emerald">
          {gsc && gsc.headline ? (
            <>
              <KpiRow cols={2}>
                <KpiCard label="Clicks" value={fmt(gsc.headline.clicks)} delta={gsc.headlineDelta?.clicks} hero="emerald" />
                <KpiCard label="Impressions" value={fmt(gsc.headline.impressions)} delta={gsc.headlineDelta?.impressions} />
              </KpiRow>
              <KpiRow cols={2}>
                <KpiCard label="CTR" value={fmtPct(gsc.headline.ctr, 2)} delta={gsc.headlineDelta?.ctr} />
                <KpiCard label="Avg position" value={fixed(gsc.headline.position, 1)} delta={gsc.headlineDelta?.position} deltaLowerIsBetter />
              </KpiRow>
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>GSC unavailable.</div>
          )}
        </Card>

        <Card title="AI search visibility" accent="purple">
          {profoundWh ? (
            <>
              <KpiRow cols={2}>
                <KpiCard label="Citation share" value={fmt(profoundWh[1])} hero="purple" hint={profoundWh[2] || 'owned'} />
                <KpiCard label="LLM sessions" value={fmt(llmSessions)} hint={`${fmtPct(llmShare, 3)} of total`} />
              </KpiRow>
              <Insight tone="purple" icon="◆">
                AI-search citations compound. Treat this as influence, not direct conversion. The brand-demand lift from being cited shows up later in branded organic clicks above.
              </Insight>
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Profound unavailable.</div>
          )}
        </Card>

        <Card title="Paid (Google Ads)" accent="gold">
          {ads ? (
            <>
              <KpiRow cols={2}>
                <KpiCard label="Spend" value={fmtMoney(ads.cost)} delta={wh.googleAds?.headlineDelta?.cost} deltaLowerIsBetter hero="gold" />
                <KpiCard label="Sessions" value={fmt(ads.sessions)} delta={wh.googleAds?.headlineDelta?.sessions} />
              </KpiRow>
              <KpiRow cols={2}>
                <KpiCard label="Clicks" value={fmt(ads.clicks)} delta={wh.googleAds?.headlineDelta?.clicks} />
                <KpiCard label="CPC" value={'$' + fixed(ads.cpc, 2, '0.00')} delta={wh.googleAds?.headlineDelta?.cpc} deltaLowerIsBetter />
              </KpiRow>
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Google Ads data unavailable.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
