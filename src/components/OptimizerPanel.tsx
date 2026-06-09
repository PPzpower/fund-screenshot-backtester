import { useEffect, useRef, useState } from 'react';
import type { FundNavRow, OptimizerObjective, OptimizerResult, StrategyConfig } from '../types';
import { downloadCsv, formatPercent, optimizerResultsToCsv } from '../utils/format';

type Props = {
  rows: FundNavRow[];
  config: StrategyConfig;
};

type WorkerMessage =
  | { type: 'progress'; progress: { completed: number; total: number } }
  | { type: 'complete'; results: OptimizerResult[] }
  | { type: 'error'; message: string };

const objectiveLabel: Record<OptimizerObjective, string> = {
  totalReturn: '最大总收益',
  sharpeRatio: '最大夏普比率',
  returnDrawdownRatio: '最大收益回撤比',
};

export const OptimizerPanel = ({ rows, config }: Props) => {
  const [objective, setObjective] = useState<OptimizerObjective>('returnDrawdownRatio');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<OptimizerResult[]>([]);
  const [error, setError] = useState('');
  const workerRef = useRef<Worker>();

  useEffect(() => () => workerRef.current?.terminate(), []);

  const start = () => {
    if (!rows.length || isRunning) return;
    workerRef.current?.terminate();
    setIsRunning(true);
    setProgress({ completed: 0, total: 0 });
    setResults([]);
    setError('');

    const worker = new Worker(new URL('../workers/optimizer.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        setProgress(message.progress);
      } else if (message.type === 'complete') {
        setResults(message.results);
        setIsRunning(false);
        worker.terminate();
      } else if (message.type === 'error') {
        setError(message.message);
        setIsRunning(false);
        worker.terminate();
      }
    };
    worker.postMessage({ type: 'start', rows, config, objective });
  };

  const stop = () => {
    workerRef.current?.terminate();
    setIsRunning(false);
  };

  const percent = progress.total ? progress.completed / progress.total : 0;

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>参数优化</h2>
          <p>对新版策略做网格搜索，输出排名前 20 的参数组合。</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="form-label sm:w-56">
          <span>优化目标</span>
          <select
            className="field"
            value={objective}
            onChange={(event) => setObjective(event.target.value as OptimizerObjective)}
            disabled={isRunning}
          >
            {Object.entries(objectiveLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" onClick={start} disabled={!rows.length || isRunning}>
          {isRunning ? '优化中...' : '开始参数优化'}
        </button>
        <button className="secondary-button" onClick={stop} disabled={!isRunning}>
          停止
        </button>
        <button
          className="secondary-button"
          onClick={() => downloadCsv('optimizer-results.csv', optimizerResultsToCsv(results))}
          disabled={!results.length}
        >
          导出优化结果 CSV
        </button>
      </div>

      {isRunning && (
        <div className="mt-4">
          <div className="mb-2 flex justify-between text-sm text-slate-600">
            <span>
              已完成 {progress.completed} / {progress.total || '--'}
            </span>
            <span>{Math.round(percent * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.round(percent * 100)}%` }} />
          </div>
        </div>
      )}

      {error && <div className="notice warning mt-4">{error}</div>}

      <div className="table-wrap mt-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>得分</th>
              <th>总收益</th>
              <th>夏普</th>
              <th>最大回撤</th>
              <th>初始/最低/最高仓位</th>
              <th>下跌阈值</th>
              <th>上涨阈值</th>
            </tr>
          </thead>
          <tbody>
            {results.map((item) => (
              <tr key={`${item.rank}-${item.score}`}>
                <td>{item.rank}</td>
                <td>{item.score.toFixed(3)}</td>
                <td className={item.metrics.totalReturn >= 0 ? 'text-gain' : 'text-loss'}>
                  {formatPercent(item.metrics.totalReturn)}
                </td>
                <td>{item.metrics.sharpeRatio.toFixed(3)}</td>
                <td className="text-loss">{formatPercent(item.metrics.maxDrawdown)}</td>
                <td>
                  {formatPercent(item.config.initialPosition)} / {formatPercent(item.config.minPosition)} /{' '}
                  {formatPercent(item.config.maxPosition)}
                </td>
                <td>
                  {formatPercent(item.config.singleDayDropThreshold)} /{' '}
                  {formatPercent(item.config.consecutive2DropThreshold)} /{' '}
                  {formatPercent(item.config.consecutive3DropThreshold)}
                </td>
                <td>
                  {formatPercent(item.config.singleDayRiseThreshold)} /{' '}
                  {formatPercent(item.config.consecutive2RiseThreshold)} /{' '}
                  {formatPercent(item.config.consecutive3RiseThreshold)}
                </td>
              </tr>
            ))}
            {!results.length && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  确认净值数据后，可以启动参数优化。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
