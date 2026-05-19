'use client';

import { Snapshot, getGa4, getMainProperty } from '@/lib/snapshot-types';
import { fmt, fmtMoney, fmtMoney2, fmtPct } from '@/lib/format';
import { Card, ExecIntro, Insight, SectionTitle } from '@/components/shared/Card';
import { KpiCard, KpiRow } from '@/components/shared/KpiCard';
import { LineSeries, BarSeries, PALETTE } from '@/components/shared/Charts';
import { DataTable, Column } from '@/components/shared/DataTable';

type CampaignRow = { campaign: string; cost: number; sessions: number; cpc?: number; costPerSession?: number; engagementRate?: number; clicks?: number };
type KeywordRow = { keyword: string; cost: number; sessions: number; cpc?: number; clicks?: number; engagementRate?: number };
type NetworkRow = { network: string; cost: number; sessions: number; clicks?: number; cpc?: number };

export function PaidTab({ snapshot }: { snapshot: Snapshot }) {
  const ga4 = getGa4(snapshot);
  const wh = getMainProperty(ga4);
  const ads = wh?.googleAds;

  if (!ads || !ads.headline) {
    return <Card title="Paid Performance">Google Ads data not available in this snapshot.</Card>;
  }

  const annualized = ads.headline.cost * 12;
  const clickToSession = ads.headline.clicks > 0 ? (ads.headline.sessions / ads.headline.clicks) : 0;

  const campaignCols: Column<CampaignRow>[] = [
    { key: 'campaign', label: 'Campaign', render: (r) => <span style={{ fontSize: 12 }}>{r.campaign}</span> },
    { key: 'cost', label: 'Cost', align: 'right', render: (r) => fmtMoney(r.cost) },
    { key: 'sessions', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions) },
    { key: 'cpc', label: 'CPC', align: 'right', render: (r) => (r.cpc !== undefined ? fmtMoney2(r.cpc) : '-'), sortValue: (r) => r.cpc ?? 0 },
    { key: 'costPerSession', label: '$/sess', align: 'right', render: (r) => (r.costPerSession !== undefined ? fmtMoney2(r.costPerSession) : '-'), sortValue: (r) => r.costPerSession ?? 0 },
    { key: 'engagementRate', label: 'Engage', align: 'right', render: (r) => fmtPct(r.engagementRate), sortValue: (r) => r.engagementRate ?? 0 },
  ];

  const keywordCols: Column<KeywordRow>[] = [
    { key: 'keyword', label: 'Keyword' },
    { key: 'cost', label: 'Cost', align: 'right', render: (r) => fmtMoney(r.cost) },
    { key: 'sessions', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions) },
    { key: 'cpc', label: 'CPC', align: 'right', render: (r) => (r.cpc !== undefined ? fmtMoney2(r.cpc) : '-'), sortValue: (r) => r.cpc ?? 0 },
    { key: 'clicks', label: 'Clicks', align: 'right', render: (r) => fmt(r.clicks), sortValue: (r) => r.clicks ?? 0 },
  ];

  const networkCols: Column<NetworkRow>[] = [
    { key: 'network', label: 'Network' },
    { key: 'cost', label: 'Cost', align: 'right', render: (r) => fmtMoney(r.cost) },
    { key: 'sessions', label: 'Sessions', align: 'right', render: (r) => fmt(r.sessions) },
    { key: 'cpc', label: 'CPC', align: 'right', render: (r) => (r.cpc !== undefined ? fmtMoney2(r.cpc) : '-'), sortValue: (r) => r.cpc ?? 0 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ExecIntro>
        <strong>Paid efficiency at a glance.</strong> Spend, sessions, CPC, and the campaigns and keywords pulling the most weight.{' '}
        Watch for spend rising while sessions fall and for one campaign hoarding budget share.
      </ExecIntro>

      <Card title="Headline" accent="gold">
        <KpiRow cols={4}>
          <KpiCard label="Spend" value={fmtMoney(ads.headline.cost)} delta={ads.headlineDelta?.cost} deltaLowerIsBetter hero="gold" />
          <KpiCard label="Sessions" value={fmt(ads.headline.sessions)} delta={ads.headlineDelta?.sessions} />
          <KpiCard label="Clicks" value={fmt(ads.headline.clicks)} delta={ads.headlineDelta?.clicks} />
          <KpiCard label="CPC" value={fmtMoney2(ads.headline.cpc)} delta={ads.headlineDelta?.cpc} deltaLowerIsBetter />
        </KpiRow>
        <KpiRow cols={3}>
          <KpiCard label="Click → session" value={fmtPct(clickToSession)} hint="conversion from ad click to GA4 session" />
          <KpiCard label="$/session" value={fmtMoney2(ads.headline.cost / Math.max(1, ads.headline.sessions))} />
          <KpiCard label="Annualized spend" value={fmtMoney(annualized)} hint="if current month repeats" />
        </KpiRow>
      </Card>

      <Card title="30-day spend trend">
        <LineSeries
          labels={ads.daily.map((_, i) => `D${i + 1}`)}
          series={[{ name: 'Daily spend', data: ads.daily, color: PALETTE.gold, fill: true }]}
          height={220}
          yFormatter={(n) => fmtMoney(n)}
        />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <Card title="Top campaigns">
          <DataTable columns={campaignCols} rows={ads.campaigns || []} defaultSortKey="cost" pageSize={10} />
          {(ads.campaigns?.length ?? 0) > 0 && (
            <Insight tone="warn" icon="!">
              <strong>{ads.campaigns[0].campaign}</strong> accounts for{' '}
              {fmtPct(ads.campaigns[0].cost / Math.max(1, ads.headline.cost))} of paid spend in this window.
            </Insight>
          )}
        </Card>

        <Card title="By network">
          <DataTable columns={networkCols} rows={ads.byNetwork || []} defaultSortKey="cost" />
        </Card>
      </div>

      <Card title="Top keywords">
        <DataTable columns={keywordCols} rows={ads.keywords || []} defaultSortKey="cost" pageSize={15} />
      </Card>

      {ads.ytd && ads.ytd.length > 0 && (
        <Card title="YTD monthly trend">
          <BarSeries
            labels={ads.ytd.map((m) => m.yearMonth)}
            series={[
              { name: 'Cost', data: ads.ytd.map((m) => m.cost), color: PALETTE.gold },
              { name: 'Sessions', data: ads.ytd.map((m) => m.sessions), color: PALETTE.primary },
            ]}
            height={240}
            yFormatter={(n) => fmt(n)}
          />
        </Card>
      )}
    </div>
  );
}
