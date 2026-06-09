import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';
import type { BacktestResult } from '../types';

type Props = {
  results: BacktestResult[];
};

export const AssetChart = ({ results }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !results.length) return;
    const chart = echarts.init(ref.current);
    const dates = results[0].rows.map((row) => row.date);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { top: 0 },
      grid: { left: 56, right: 20, top: 48, bottom: 36 },
      xAxis: { type: 'category', data: dates, boundaryGap: false },
      yAxis: { type: 'value', scale: true },
      series: results.map((result) => ({
        name: result.strategyName,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: result.rows.map((row) => Number(row.totalAsset.toFixed(2))),
      })),
    });
    const resize = () => chart.resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      chart.dispose();
    };
  }, [results]);

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>资产曲线</h2>
          <p>对比四种策略每日总资产变化。</p>
        </div>
      </div>
      <div ref={ref} className="chart" />
    </section>
  );
};
