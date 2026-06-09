import type { BacktestRow } from '../types';
import { backtestRowsToCsv, downloadCsv, formatMoney, formatPercent } from '../utils/format';

type Props = {
  rows: BacktestRow[];
};

const actionText = {
  buy: '买入',
  sell: '卖出',
  hold: '持有',
};

const regimeText = {
  uptrend: '主升浪',
  sideways: '震荡',
  breakdown: '破位',
};

export const TradeLogTable = ({ rows }: Props) => {
  const tradeRows = rows.filter((row) => row.action !== 'hold' && row.tradeAmount > 0);
  if (!rows.length) return null;

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>新版策略交易日志</h2>
          <p>记录每一次加仓和减仓原因。</p>
        </div>
        <button className="secondary-button" onClick={() => downloadCsv('new-rule-trades.csv', backtestRowsToCsv(tradeRows))}>
          导出交易日志 CSV
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>操作</th>
              <th>交易金额</th>
              <th>净值</th>
              <th>仓位</th>
              <th>市场状态</th>
              <th>触发原因</th>
            </tr>
          </thead>
          <tbody>
            {tradeRows.map((row) => (
              <tr key={`${row.date}-${row.tradeType}`}>
                <td>{row.date}</td>
                <td className={row.action === 'buy' ? 'text-gain font-semibold' : 'text-loss font-semibold'}>
                  {actionText[row.action]}
                </td>
                <td>{formatMoney(row.tradeAmount)}</td>
                <td>{row.nav.toFixed(4)}</td>
                <td>{formatPercent(row.positionRatio)}</td>
                <td>{regimeText[row.marketRegime]}</td>
                <td>{row.signalReason}</td>
              </tr>
            ))}
            {!tradeRows.length && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400">
                  新版策略在这段数据中没有产生交易。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
