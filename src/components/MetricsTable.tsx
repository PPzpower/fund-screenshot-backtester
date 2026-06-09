import type { BacktestResult } from '../types';
import { downloadCsv, formatMoney, formatPercent, metricsToCsv } from '../utils/format';

type Props = {
  results: BacktestResult[];
};

export const MetricsTable = ({ results }: Props) => {
  if (!results.length) return null;

  const metrics = results.map((result) => result.metrics);
  const bestReturn = Math.max(...metrics.map((item) => item.totalReturn));
  const bestDrawdown = Math.max(...metrics.map((item) => item.maxDrawdown));
  const bestSharpe = Math.max(...metrics.map((item) => item.sharpeRatio));
  const bestReturnDrawdown = Math.max(
    ...metrics.map((item) => item.totalReturn / Math.max(Math.abs(item.maxDrawdown), 0.0001)),
  );

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>策略对比</h2>
          <p>红色表示收益较高，绿色用于回撤和下跌数据。</p>
        </div>
        <button className="secondary-button" onClick={() => downloadCsv('strategy-metrics.csv', metricsToCsv(metrics))}>
          导出指标 CSV
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>策略</th>
              <th>期末资产</th>
              <th>总收益</th>
              <th>年化收益</th>
              <th>最大回撤</th>
              <th>夏普</th>
              <th>收益回撤比</th>
              <th>交易次数</th>
              <th>平均仓位</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const item = result.metrics;
              const returnDrawdown = item.totalReturn / Math.max(Math.abs(item.maxDrawdown), 0.0001);
              return (
                <tr key={result.strategyId}>
                  <td className="font-semibold">{item.strategyName}</td>
                  <td>{formatMoney(item.finalAsset)}</td>
                  <td className={item.totalReturn === bestReturn ? 'highlight-gain' : item.totalReturn >= 0 ? 'text-gain' : 'text-loss'}>
                    {formatPercent(item.totalReturn)}
                  </td>
                  <td className={item.annualizedReturn >= 0 ? 'text-gain' : 'text-loss'}>
                    {formatPercent(item.annualizedReturn)}
                  </td>
                  <td className={item.maxDrawdown === bestDrawdown ? 'highlight-loss' : 'text-loss'}>
                    {formatPercent(item.maxDrawdown)}
                  </td>
                  <td className={item.sharpeRatio === bestSharpe ? 'highlight-gain' : ''}>{item.sharpeRatio.toFixed(3)}</td>
                  <td className={returnDrawdown === bestReturnDrawdown ? 'highlight-gain' : ''}>{returnDrawdown.toFixed(2)}</td>
                  <td>{item.tradeCount}</td>
                  <td>{formatPercent(item.avgPosition)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
