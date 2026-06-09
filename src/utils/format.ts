import type { BacktestRow, FundNavRow, OptimizerResult, StrategyMetrics } from '../types';

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const formatMoney = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '--';

export const formatNumber = (value: number, digits = 4) =>
  Number.isFinite(value) ? value.toFixed(digits) : '--';

export const formatPercent = (value?: number, digits = 2) =>
  typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '--';

export const asInputPercent = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value) ? (value * 100).toFixed(2) : '';

export const parsePercentInput = (value: string) => {
  const cleaned = value.replace('%', '').trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed / 100 : undefined;
};

export const isValidDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

export const sortRowsByDate = (rows: FundNavRow[]) =>
  [...rows].sort((a, b) => a.date.localeCompare(b.date));

export const recalculateDailyReturns = (rows: FundNavRow[]) => {
  const sorted = sortRowsByDate(rows);
  return sorted.map((row, index) => {
    if (index === 0) return { ...row, dailyReturn: row.dailyReturn ?? 0 };
    const previous = sorted[index - 1];
    const dailyReturn = previous.nav > 0 ? row.nav / previous.nav - 1 : row.dailyReturn;
    return { ...row, dailyReturn };
  });
};

export const normalizeRowsForBacktest = (rows: FundNavRow[]) =>
  recalculateDailyReturns(
    rows
      .filter((row) => isValidDate(row.date) && Number.isFinite(row.nav) && row.nav > 0)
      .map((row) => ({ ...row, dailyReturn: row.dailyReturn ?? 0 })),
  );

const escapeCsv = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

export const toCsv = (headers: string[], rows: unknown[][]) =>
  [headers.map(escapeCsv).join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');

export const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const navRowsToCsv = (rows: FundNavRow[]) =>
  toCsv(
    ['日期', '净值', '日涨幅'],
    sortRowsByDate(rows).map((row) => [row.date, row.nav, formatPercent(row.dailyReturn)]),
  );

export const metricsToCsv = (metrics: StrategyMetrics[]) =>
  toCsv(
    [
      '策略',
      '期末资产',
      '总收益',
      '年化收益',
      '最大回撤',
      '波动率',
      '夏普比率',
      '交易次数',
      '胜率',
      '平均仓位',
      '最高仓位',
      '最低仓位',
      '资金利用率',
      '最佳日收益',
      '最差日收益',
      '最长回撤天数',
    ],
    metrics.map((item) => [
      item.strategyName,
      item.finalAsset.toFixed(2),
      formatPercent(item.totalReturn),
      formatPercent(item.annualizedReturn),
      formatPercent(item.maxDrawdown),
      formatPercent(item.volatility),
      item.sharpeRatio.toFixed(3),
      item.tradeCount,
      formatPercent(item.winRate),
      formatPercent(item.avgPosition),
      formatPercent(item.maxPosition),
      formatPercent(item.minPosition),
      formatPercent(item.cashUtilization),
      formatPercent(item.bestDayReturn),
      formatPercent(item.worstDayReturn),
      item.longestDrawdownDays,
    ]),
  );

export const backtestRowsToCsv = (rows: BacktestRow[]) =>
  toCsv(
    [
      '日期',
      '净值',
      '日涨幅',
      '现金',
      '份额',
      '持仓市值',
      '总资产',
      '仓位',
      '操作',
      '交易金额',
      '交易类型',
      '市场状态',
      '信号原因',
      '允许最高仓位',
      '累计收益',
      '回撤',
    ],
    rows.map((row) => [
      row.date,
      row.nav,
      formatPercent(row.dailyReturn),
      row.cash.toFixed(2),
      row.fundUnits.toFixed(4),
      row.holdingValue.toFixed(2),
      row.totalAsset.toFixed(2),
      formatPercent(row.positionRatio),
      row.action,
      row.tradeAmount.toFixed(2),
      row.tradeType,
      row.marketRegime,
      row.signalReason,
      formatPercent(row.maxPositionAllowed),
      formatPercent(row.cumulativeReturn),
      formatPercent(row.drawdown),
    ]),
  );

export const optimizerResultsToCsv = (rows: OptimizerResult[]) =>
  toCsv(
    [
      '排名',
      '目标',
      '得分',
      '总收益',
      '夏普比率',
      '最大回撤',
      '初始仓位',
      '最低仓位',
      '最高仓位',
      '单日下跌阈值',
      '连跌2日阈值',
      '连跌3日阈值',
      '单日上涨阈值',
      '连涨2日阈值',
      '连涨3日阈值',
    ],
    rows.map((item) => [
      item.rank,
      item.objective,
      item.score.toFixed(4),
      formatPercent(item.metrics.totalReturn),
      item.metrics.sharpeRatio.toFixed(3),
      formatPercent(item.metrics.maxDrawdown),
      formatPercent(item.config.initialPosition),
      formatPercent(item.config.minPosition),
      formatPercent(item.config.maxPosition),
      formatPercent(item.config.singleDayDropThreshold),
      formatPercent(item.config.consecutive2DropThreshold),
      formatPercent(item.config.consecutive3DropThreshold),
      formatPercent(item.config.singleDayRiseThreshold),
      formatPercent(item.config.consecutive2RiseThreshold),
      formatPercent(item.config.consecutive3RiseThreshold),
    ]),
  );
