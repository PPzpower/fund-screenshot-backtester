import type { BacktestRow, StrategyMetrics } from '../types';

const annualTradingDays = 252;

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const standardDeviation = (values: number[]) => {
  if (values.length < 2) return 0;
  const avg = average(values);
  const variance = average(values.map((value) => (value - avg) ** 2));
  return Math.sqrt(variance);
};

const longestDrawdownDays = (rows: BacktestRow[]) => {
  let current = 0;
  let longest = 0;
  rows.forEach((row) => {
    if (row.drawdown < 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });
  return longest;
};

export const calculateMetrics = (
  strategyName: string,
  rows: BacktestRow[],
  initialCash: number,
): StrategyMetrics => {
  const finalAsset = rows.length ? rows[rows.length - 1].totalAsset : initialCash;
  const totalReturn = finalAsset / initialCash - 1;
  const days = Math.max(rows.length, 1);
  const annualizedReturn = days > 1 ? (1 + totalReturn) ** (annualTradingDays / days) - 1 : totalReturn;
  const assetReturns = rows.slice(1).map((row, index) => {
    const previous = rows[index];
    return previous.totalAsset > 0 ? row.totalAsset / previous.totalAsset - 1 : 0;
  });
  const dailyStd = standardDeviation(assetReturns);
  const volatility = dailyStd * Math.sqrt(annualTradingDays);
  const sharpeRatio = volatility > 0 ? annualizedReturn / volatility : 0;
  const tradeRows = rows.filter((row) => row.action !== 'hold' && row.tradeAmount > 0);
  const positiveDays = assetReturns.filter((value) => value > 0).length;
  const maxDrawdown = Math.min(...rows.map((row) => row.drawdown), 0);
  const positions = rows.map((row) => row.positionRatio);
  const cashRatios = rows.map((row) => (row.totalAsset > 0 ? 1 - row.cash / row.totalAsset : 0));

  return {
    strategyName,
    finalAsset,
    totalReturn,
    annualizedReturn,
    maxDrawdown,
    volatility,
    sharpeRatio,
    tradeCount: tradeRows.length,
    winRate: assetReturns.length ? positiveDays / assetReturns.length : 0,
    avgPosition: average(positions),
    maxPosition: Math.max(...positions, 0),
    minPosition: Math.min(...positions, 1),
    cashUtilization: average(cashRatios),
    bestDayReturn: Math.max(...assetReturns, 0),
    worstDayReturn: Math.min(...assetReturns, 0),
    longestDrawdownDays: longestDrawdownDays(rows),
  };
};
