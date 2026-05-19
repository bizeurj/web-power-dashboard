'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const PALETTE = {
  primary: '#2563eb',
  primarySoft: 'rgba(37,99,235,0.15)',
  teal: '#0891b2',
  tealSoft: 'rgba(8,145,178,0.15)',
  purple: '#7c3aed',
  purpleSoft: 'rgba(124,58,237,0.15)',
  gold: '#d97706',
  goldSoft: 'rgba(217,119,6,0.15)',
  emerald: '#0d9488',
  emeraldSoft: 'rgba(13,148,136,0.15)',
  rose: '#be185d',
  roseSoft: 'rgba(190,24,93,0.15)',
  neutral: '#94a3b8',
};

const COLORS_CYCLE = [PALETTE.primary, PALETTE.emerald, PALETTE.purple, PALETTE.gold, PALETTE.teal, PALETTE.rose, PALETTE.neutral];

export function ChartBox({
  children,
  height = 240,
}: {
  children: React.ReactNode;
  height?: number;
}) {
  return <div style={{ position: 'relative', height }}>{children}</div>;
}

const baseScales = {
  x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#6b7587' } },
  y: { grid: { color: '#e4e7ed' }, ticks: { font: { size: 10 }, color: '#6b7587' } },
};

const baseTooltip = {
  backgroundColor: 'rgba(11,18,32,0.92)',
  titleFont: { size: 12 },
  bodyFont: { size: 12 },
  padding: 10,
  cornerRadius: 6,
  displayColors: true,
};

export function LineSeries({
  labels,
  series,
  height = 240,
  yFormatter,
}: {
  labels: string[];
  series: { name: string; data: number[]; color?: string; fill?: boolean }[];
  height?: number;
  yFormatter?: (n: number) => string;
}) {
  const data = {
    labels,
    datasets: series.map((s, i) => {
      const color = s.color || COLORS_CYCLE[i % COLORS_CYCLE.length];
      return {
        label: s.name,
        data: s.data,
        borderColor: color,
        backgroundColor: s.fill ? hexToSoft(color) : color,
        pointRadius: 0,
        pointHoverRadius: 3,
        borderWidth: 2,
        fill: !!s.fill,
        tension: 0.3,
      };
    }),
  };
  return (
    <ChartBox height={height}>
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: series.length > 1,
              position: 'bottom',
              labels: { font: { size: 11 }, boxWidth: 10, boxHeight: 10 },
            },
            tooltip: {
              ...baseTooltip,
              callbacks: yFormatter
                ? {
                    label: (ctx) => `${ctx.dataset.label}: ${yFormatter(Number(ctx.parsed.y))}`,
                  }
                : undefined,
            },
          },
          scales: {
            x: { ...baseScales.x },
            y: {
              ...baseScales.y,
              beginAtZero: true,
              ticks: { ...baseScales.y.ticks, callback: (v) => (yFormatter ? yFormatter(Number(v)) : v) },
            },
          },
        }}
      />
    </ChartBox>
  );
}

export function BarSeries({
  labels,
  series,
  height = 240,
  horizontal = false,
  yFormatter,
  stacked = false,
}: {
  labels: string[];
  series: { name: string; data: number[]; color?: string }[];
  height?: number;
  horizontal?: boolean;
  yFormatter?: (n: number) => string;
  stacked?: boolean;
}) {
  const data = {
    labels,
    datasets: series.map((s, i) => ({
      label: s.name,
      data: s.data,
      backgroundColor: s.color || COLORS_CYCLE[i % COLORS_CYCLE.length],
      borderRadius: 4,
    })),
  };
  return (
    <ChartBox height={height}>
      <Bar
        data={data}
        options={{
          indexAxis: horizontal ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: series.length > 1,
              position: 'bottom',
              labels: { font: { size: 11 }, boxWidth: 10, boxHeight: 10 },
            },
            tooltip: {
              ...baseTooltip,
              callbacks: yFormatter
                ? { label: (ctx) => `${ctx.dataset.label}: ${yFormatter(Number(ctx.parsed[horizontal ? 'x' : 'y']))}` }
                : undefined,
            },
          },
          scales: {
            x: {
              ...baseScales.x,
              stacked,
              ticks: { ...baseScales.x.ticks, callback: (v) => (horizontal && yFormatter ? yFormatter(Number(v)) : v) },
            },
            y: {
              ...baseScales.y,
              stacked,
              ticks: { ...baseScales.y.ticks, callback: (v) => (!horizontal && yFormatter ? yFormatter(Number(v)) : v) },
            },
          },
        }}
      />
    </ChartBox>
  );
}

export function DoughnutSeries({
  labels,
  values,
  height = 240,
  colors,
}: {
  labels: string[];
  values: number[];
  height?: number;
  colors?: string[];
}) {
  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: (colors || COLORS_CYCLE).slice(0, labels.length),
        borderWidth: 1,
        borderColor: '#fff',
      },
    ],
  };
  return (
    <ChartBox height={height}>
      <Doughnut
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
            tooltip: baseTooltip,
          },
        }}
      />
    </ChartBox>
  );
}

function hexToSoft(hex: string): string {
  // crude but enough — convert #rrggbb to rgba(r,g,b,0.15)
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.15)`;
}

export { PALETTE };
