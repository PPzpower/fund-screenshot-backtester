import { DEFAULT_STRATEGY_CONFIG, STRATEGY_NAMES } from '../config';
import type { BacktestResult, BacktestRow, FundNavRow, StrategyConfig, StrategyId } from '../types';
import { buildIndicators } from '../utils/indicators';
import { calculateMetrics } from '../utils/metrics';
import { clamp, normalizeRowsForBacktest } from '../utils/format';
import { getMaxPositionAllowed, getMinPositionAllowed, getStrategyInitialPosition, getStrategySignal } from './strategies';

const strategyOrder: StrategyId[] = [
  'buy_and_hold',
  'fixed_50_percent',
  'old_rule_strategy',
  'new_rule_strategy',
  'adaptive_profit_strategy',
  'adaptive_defensive_strategy',
];

type Portfolio = {
  cash: number;
  fundUnits: number;
};

const calculateSnapshot = (portfolio: Portfolio, nav: number) => {
  const holdingValue = portfolio.fundUnits * nav;
  const totalAsset = portfolio.cash + holdingValue;
  const positionRatio = totalAsset > 0 ? holdingValue / totalAsset : 0;
  return { holdingValue, totalAsset, positionRatio };
};

const buy = (
  portfolio: Portfolio,
  nav: number,
  requestedAmount: number,
  maxPositionAllowed: number,
  feeRate: number,
) => {
  const before = calculateSnapshot(portfolio, nav);
  const roomByPosition = Math.max(0, before.totalAsset * maxPositionAllowed - before.holdingValue);
  const maxSpendByPosition = feeRate < 1 ? roomByPosition / (1 - feeRate) : 0;
  const spend = Math.max(0, Math.min(requestedAmount, portfolio.cash, maxSpendByPosition));
  if (spend <= 0) return 0;

  const netAmount = spend * (1 - feeRate);
  portfolio.cash -= spend;
  portfolio.fundUnits += netAmount / nav;
  if (portfolio.cash < 1e-6) portfolio.cash = 0;
  return spend;
};

const sell = (
  portfolio: Portfolio,
  nav: number,
  requestedAmount: number,
  minPosition: number,
  feeRate: number,
) => {
  const before = calculateSnapshot(portfolio, nav);
  const sellableByMinPosition = Math.max(0, before.holdingValue - before.totalAsset * minPosition);
  const grossSell = Math.max(0, Math.min(requestedAmount, before.holdingValue, sellableByMinPosition));
  if (grossSell <= 0) return 0;

  portfolio.fundUnits -= grossSell / nav;
  portfolio.cash += grossSell * (1 - feeRate);
  if (portfolio.fundUnits < 1e-8) portfolio.fundUnits = 0;
  return grossSell;
};

const openInitialPosition = (
  portfolio: Portfolio,
  nav: number,
  initialCash: number,
  position: number,
  buyFee: number,
) => {
  const spend = clamp(initialCash * position, 0, portfolio.cash);
  if (spend <= 0) return;
  portfolio.cash -= spend;
  portfolio.fundUnits += (spend * (1 - buyFee)) / nav;
};

export const runBacktest = (
  sourceRows: FundNavRow[],
  strategyId: StrategyId,
  configInput: Partial<StrategyConfig> = {},
): BacktestResult => {
  const config = { ...DEFAULT_STRATEGY_CONFIG, ...configInput };
  const rows = normalizeRowsForBacktest(sourceRows);
  const portfolio: Portfolio = { cash: config.initialCash, fundUnits: 0 };
  const initialPosition = getStrategyInitialPosition(strategyId, config);
  const indicators = buildIndicators(rows);
  const resultRows: BacktestRow[] = [];
  let peakAsset = config.initialCash;

  if (rows.length === 0) {
    return {
      strategyId,
      strategyName: STRATEGY_NAMES[strategyId],
      rows: [],
      metrics: calculateMetrics(STRATEGY_NAMES[strategyId], [], config.initialCash),
    };
  }

  openInitialPosition(portfolio, rows[0].nav, config.initialCash, initialPosition, config.buyFee);

  rows.forEach((row, index) => {
    const marketRegime = indicators.regimes[index];
    const amountPerPart = config.initialCash / 10;
    const maxPositionAllowed = getMaxPositionAllowed(strategyId, config, marketRegime);
    const minPositionAllowed = getMinPositionAllowed(strategyId, config, marketRegime);
    const beforeSignal = calculateSnapshot(portfolio, row.nav);
    const signal = getStrategySignal(strategyId, rows, index, config, marketRegime, {
      positionRatio: beforeSignal.positionRatio,
      totalAsset: beforeSignal.totalAsset,
      amountPerPart,
    });
    let action = signal.action;
    let tradeAmount = 0;
    let signalReason = signal.reason;
    let tradeType = signal.tradeType;

    if (signal.action === 'buy') {
      const requested = signal.parts * amountPerPart;
      tradeAmount = buy(portfolio, row.nav, requested, maxPositionAllowed, config.buyFee);
      if (tradeAmount <= 0) {
        action = 'hold';
        tradeType = 'buy_blocked';
        signalReason = `${signal.reason}，但现金不足或已到仓位上限`;
      }
    } else if (signal.action === 'sell') {
      const requested = signal.parts * amountPerPart;
      tradeAmount = sell(portfolio, row.nav, requested, minPositionAllowed, config.sellFee);
      if (tradeAmount <= 0) {
        action = 'hold';
        tradeType = 'sell_blocked';
        signalReason = `${signal.reason}，但已接近最低仓位`;
      }
    }

    const snapshot = calculateSnapshot(portfolio, row.nav);
    peakAsset = Math.max(peakAsset, snapshot.totalAsset);
    const cumulativeReturn = snapshot.totalAsset / config.initialCash - 1;
    const drawdown = peakAsset > 0 ? snapshot.totalAsset / peakAsset - 1 : 0;

    resultRows.push({
      date: row.date,
      nav: row.nav,
      dailyReturn: row.dailyReturn ?? 0,
      cash: snapshot.totalAsset < 0 ? 0 : portfolio.cash,
      fundUnits: portfolio.fundUnits,
      holdingValue: snapshot.holdingValue,
      totalAsset: snapshot.totalAsset,
      positionRatio: snapshot.positionRatio,
      action,
      tradeAmount,
      tradeType,
      marketRegime,
      signalReason,
      maxPositionAllowed,
      cumulativeReturn,
      drawdown,
    });
  });

  return {
    strategyId,
    strategyName: STRATEGY_NAMES[strategyId],
    rows: resultRows,
    metrics: calculateMetrics(STRATEGY_NAMES[strategyId], resultRows, config.initialCash),
  };
};

export const runAllStrategies = (
  rows: FundNavRow[],
  config: StrategyConfig,
  strategies: StrategyId[] = strategyOrder,
) => strategies.map((strategyId) => runBacktest(rows, strategyId, config));
