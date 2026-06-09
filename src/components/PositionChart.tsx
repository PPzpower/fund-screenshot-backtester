import * as echarts from 'echarts';
import { useEffect, useRef } from 'react';
import type { BacktestRow } from '../types';

type Props = {
  rows: BacktestRow[];
};

export const PositionChart = ({ rows }: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !rows.length) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 56, right: 20, top: 28, bottom: 36 },
      xAxis: { type: 'category', data: rows.map((row) => row.date), boundaryGap: false },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
      series: [
        {
          name: '新版策略仓位',
          type: 'line',
          step: 'middle',
          symbol: 'none',
          data: rows.map((row) => Number((row.positionRatio * 100).toFixed(2))),
        },
        {
          name: '允许最高仓位',
          type: 'line',
          step: 'middle',
          symbol: 'none',
          lineStyle: { type: 'dashed' },
          data: rows.map((row) => Number((row.maxPositionAllowed * 100).toFixed(2))),
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
          <h2>新版策略仓位</h2>
          <p>显示实际仓位与当前允许最高仓位。</p>
        </div>
      </div>
      <div ref={ref} className="chart" />
    </section>
  );
};
