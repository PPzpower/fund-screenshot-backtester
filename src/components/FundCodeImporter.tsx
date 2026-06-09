import { useState } from 'react';
import type { FundDataSet } from '../types';
import { fetchFundRecentNav, parseFundCodes } from '../utils/fundApi';
import { formatPercent } from '../utils/format';

type Props = {
  funds: FundDataSet[];
  onImported: (funds: FundDataSet[]) => void;
  onSelectFund: (id: string) => void;
};

export const FundCodeImporter = ({ funds, onImported, onSelectFund }: Props) => {
  const [codesText, setCodesText] = useState('000001');
  const [recentDays, setRecentDays] = useState(60);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  const startImport = async () => {
    const codes = parseFundCodes(codesText);
    if (!codes.length) {
      setMessage('请输入至少一个 6 位基金代码。');
      return;
    }

    setIsLoading(true);
    setMessage('');
    setProgress({ completed: 0, total: codes.length });

    const imported: FundDataSet[] = [];
    const failures: string[] = [];
    for (let index = 0; index < codes.length; index += 1) {
      const code = codes[index];
      try {
        imported.push(await fetchFundRecentNav(code, recentDays));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `${code} 导入失败`);
      } finally {
        setProgress({ completed: index + 1, total: codes.length });
      }
    }

    onImported(imported);
    setIsLoading(false);
    setMessage(
      failures.length
        ? `已导入 ${imported.length} 只基金，失败 ${failures.length} 只：${failures.join('；')}`
        : `已导入 ${imported.length} 只基金。`,
    );
  };

  const percent = progress.total ? progress.completed / progress.total : 0;

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>基金代码导入</h2>
          <p>输入多只基金代码和近 N 个自然日，自动获取净值、日涨幅和区间总涨幅。</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_180px_auto]">
        <label className="form-label">
          <span>基金代码</span>
          <textarea
            className="field min-h-24 font-mono"
            value={codesText}
            onChange={(event) => setCodesText(event.target.value)}
            placeholder="每行一个或用逗号分隔，例如：000001, 012345"
          />
        </label>
        <label className="form-label">
          <span>近 N 天</span>
          <input
            className="field"
            type="number"
            min={1}
            max={2000}
            value={recentDays}
            onChange={(event) => setRecentDays(Math.max(1, Number(event.target.value)))}
          />
        </label>
        <div className="flex items-end">
          <button className="primary-button w-full" onClick={startImport} disabled={isLoading}>
            {isLoading ? '导入中...' : '获取净值数据'}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="mt-4">
          <div className="mb-2 flex justify-between text-sm text-slate-600">
            <span>
              已完成 {progress.completed} / {progress.total}
            </span>
            <span>{Math.round(percent * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.round(percent * 100)}%` }} />
          </div>
        </div>
      )}

      {message && <div className="notice mt-4">{message}</div>}

      {funds.length > 0 && (
        <div className="table-wrap mt-4">
          <table className="data-table">
            <thead>
              <tr>
                <th>基金</th>
                <th>代码</th>
                <th>查询窗口</th>
                <th>实际交易日</th>
                <th>起止日期</th>
                <th>区间总涨幅</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((fund) => (
                <tr key={fund.id}>
                  <td className="font-semibold">{fund.fundName}</td>
                  <td>{fund.fundCode}</td>
                  <td>近 {fund.recentDays} 天</td>
                  <td>{fund.actualTradingDays}</td>
                  <td>
                    {fund.startDate} 至 {fund.endDate}
                  </td>
                  <td className={(fund.periodReturn ?? 0) >= 0 ? 'text-gain' : 'text-loss'}>
                    {formatPercent(fund.periodReturn)}
                  </td>
                  <td>
                    <button className="text-button" onClick={() => onSelectFund(fund.id)}>
                      核对净值
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
