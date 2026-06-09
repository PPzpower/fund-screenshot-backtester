import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';
import type { BacktestRow, MarketRegime } from '../types';

type Props = {
  rows: BacktestRow[];
};

const regimeName: Record<MarketRegime, string> = {
  uptrend: '主升浪',
  sideways: '震荡',
  breakdown: '破位',
};

const regimeColor: Record<MarketRegime, string> = {
  uptrend: 'rgba(193,18,31,0.08)',
  sideways: 'rgba(100,116,139,0.08)',
  breakdown: 'rgba(19,138,54,0.08)',
};

const buildRegimeAreas = (rows: BacktestRow[]) => {
  const areas: Array<[{ name: string; xAxis: string; itemStyle: { color: string } }, { xAxis: string }]> = [];
  let start = 0;
  for (let index = 1; index <= rows.length; index += 1) {
    if (index === rows.length || rows[index].marketRegime !== rows[start].marketRegime) {
      const regime = rows[start].marketRegime;
      areas.push([
        { name: regimeName[regime], xAxis: rows[start].date, itemStyle: { color: regimeColor[regime] } },
        { xAxis: rows[index - 1].date },
      ]);
      start = index;
    }
  }
  return areas;
};

export const TradeSignalChart = ({ rows }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !rows.length) return;
    const chart = echarts.init(ref.current);
    const buyPoints = rows
      .filter((row) => row.action === 'buy')
      .map((row) => [row.date, row.nav, row.signalReason]);
    const sellPoints = rows
      .filter((row) => row.action === 'sell')
      .map((row) => [row.date, row.nav, row.signalReason]);

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [];
          return items
            .map((item) => {
              const value = item.value as [string, number, string] | number;
              if (Array.isArray(value)) return `${item.marker}${item.seriesName}: ${value[1]}<br/>${value[2] ?? ''}`;
              return `${item.marker}${item.seriesName}: ${value}`;
            })
            .join('<br/>');
        },
      },
      legend: { top: 0 },
      grid: { left: 56, right: 20, top: 48, bottom: 36 },
      xAxis: { type: 'category', data: rows.map((row) => row.date), boundaryGap: false },
      yAxis: { type: 'value', scale: true },
      series: [
        {
          name: '净值',
          type: 'line',
          symbol: 'none',
          data: rows.map((row) => row.nav),
          markArea: { silent: true, data: buildRegimeAreas(rows) },
        },
        {
          name: '买入',
          type: 'scatter',
          symbolSize: 12,
          itemStyle: { color: '#c1121f' },
          data: buyPoints,
        },
        {
          name: '卖出',
          type: 'scatter',
          symbolSize: 12,
          itemStyle: { color: '#138a36' },
          data: sellPoints,
        },
      ],
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [rows]);

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>买卖点与市场状态</h2>
          <p>背景色表示主升浪、震荡或破位状态。</p>
        </div>
      </div>
      <div ref={ref} className="chart" />
    </section>
  );
};
