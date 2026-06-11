import type { FundNavRow, MarketRegime, StrategyConfig, StrategyId, TradeAction } from '../types';
import { compoundReturn, isConsecutive } from '../utils/indicators';

export type StrategySignal = {
  action: TradeAction;
  parts: number;
  tradeType: string;
  reason: string;
};

const holdSignal = (reason = '未触发交易信号'): StrategySignal => ({
  action: 'hold',
  parts: 0,
  tradeType: 'hold',
  reason,
});

const buySignal = (parts: number, tradeType: string, reason: string): StrategySignal => ({
  action: 'buy',
  parts,
  tradeType,
  reason,
});

const sellSignal = (parts: number, tradeType: string, reason: string): StrategySignal => ({
  action: 'sell',
  parts,
  tradeType,
  reason,
});

export type StrategyContext = {
  positionRatio: number;
  totalAsset: number;
  amountPerPart: number;
};

const adaptiveStrategies: StrategyId[] = ['adaptive_profit_strategy', 'adaptive_defensive_strategy'];

const isAdaptiveStrategy = (strategyId: StrategyId) => adaptiveStrategies.includes(strategyId);

const getRuleInputs = (rows: FundNavRow[], index: number) => {
  const returns = rows.map((row) => row.dailyReturn ?? 0);
  const current = returns[index];
  const cum2 = compoundReturn(returns, index, 2);
  const cum3 = compoundReturn(returns, index, 3);

  return {
    current,
    cum2,
    cum3,
    down2: isConsecutive(returns, index, 2, 'down'),
    down3: isConsecutive(returns, index, 3, 'down'),
    up2: isConsecutive(returns, index, 2, 'up'),
    up3: isConsecutive(returns, index, 3, 'up'),
  };
};

const partsToReachPosition = (targetPosition: number, context: StrategyContext, direction: 'buy' | 'sell') => {
  const positionGap =
    direction === 'buy' ? targetPosition - context.positionRatio : context.positionRatio - targetPosition;
  if (positionGap <= 0 || context.amountPerPart <= 0) return 0;
  return (context.totalAsset * positionGap) / context.amountPerPart;
};

const getModeSignal = (signal: StrategySignal, mode: string): StrategySignal =>
  signal.action === 'hold'
    ? signal
    : {
        ...signal,
        tradeType: `${mode}：${signal.tradeType}`,
        reason: `${mode}：${signal.reason}`,
      };

export const getMaxPositionAllowed = (
  strategyId: StrategyId,
  config: StrategyConfig,
  marketRegime: MarketRegime,
) => {
  if (strategyId === 'buy_and_hold') return 1;
  if ((strategyId === 'new_rule_strategy' || isAdaptiveStrategy(strategyId)) && marketRegime === 'breakdown') {
    return Math.min(config.maxPosition, config.breakdownMaxPosition);
  }
  return config.maxPosition;
};

export const getMinPositionAllowed = (
  strategyId: StrategyId,
  config: StrategyConfig,
  marketRegime: MarketRegime,
) =>
  isAdaptiveStrategy(strategyId) && marketRegime === 'uptrend'
    ? Math.max(config.minPosition, config.uptrendMinPosition)
    : config.minPosition;

export const getStrategyInitialPosition = (strategyId: StrategyId, config: StrategyConfig) => {
  if (strategyId === 'buy_and_hold') return 1;
  if (strategyId === 'fixed_50_percent') return 0.5;
  return config.initialPosition;
};

/**
 * 新版规则：先判定减仓，再判定加仓。实际同一天涨跌只会命中一侧。
 */
export const newRuleStrategy = (
  rows: FundNavRow[],
  index: number,
  config: StrategyConfig,
  marketRegime: MarketRegime,
): StrategySignal => {
  if (index <= 0) return holdSignal('首日仅建立初始仓位');

  const returns = rows.map((row) => row.dailyReturn ?? 0);
  const current = returns[index];
  const cum2 = compoundReturn(returns, index, 2);
  const cum3 = compoundReturn(returns, index, 3);
  const down2 = isConsecutive(returns, index, 2, 'down');
  const down3 = isConsecutive(returns, index, 3, 'down');
  const up2 = isConsecutive(returns, index, 2, 'up');
  const up3 = isConsecutive(returns, index, 3, 'up');

  if (up3 && typeof cum3 === 'number' && cum3 >= config.consecutive3RiseThreshold) {
    const parts = config.uptrendSellHalf && marketRegime === 'uptrend' ? 1 : 2;
    return sellSignal(parts, '连涨3天减仓', '连续上涨 3 天且累计涨幅达到阈值');
  }

  if (up2 && typeof cum2 === 'number' && cum2 >= config.consecutive2RiseThreshold) {
    const parts = config.uptrendSellHalf && marketRegime === 'uptrend' ? 0.5 : 1;
    return sellSignal(parts, '连涨2天减仓', '连续上涨 2 天且累计涨幅达到阈值');
  }

  if (current >= config.singleDayRiseThreshold) {
    const parts = config.uptrendSellHalf && marketRegime === 'uptrend' ? 0.25 : 0.5;
    return sellSignal(parts, '单日上涨减仓', '单日涨幅达到减仓阈值');
  }

  if (current <= config.crashDropThreshold) {
    return buySignal(1, '单日暴跌加仓', '单日跌幅达到暴跌加仓阈值');
  }

  if (down3 && typeof cum3 === 'number' && cum3 <= config.consecutive3DropThreshold) {
    return buySignal(2, '连跌3天加仓', '连续下跌 3 天且累计跌幅达到阈值');
  }

  if (down2 && typeof cum2 === 'number' && cum2 <= config.consecutive2DropThreshold) {
    return buySignal(1.5, '连跌2天加仓', '连续下跌 2 天且累计跌幅达到阈值');
  }

  if (current <= config.singleDayDropThreshold) {
    return buySignal(0.5, '单日下跌加仓', '单日跌幅达到加仓阈值');
  }

  return holdSignal();
};

export const oldRuleStrategy = (
  rows: FundNavRow[],
  index: number,
  _config: StrategyConfig,
): StrategySignal => {
  if (index <= 0) return holdSignal('首日仅建立初始仓位');

  const returns = rows.map((row) => row.dailyReturn ?? 0);
  const current = returns[index];
  const cum2 = compoundReturn(returns, index, 2);
  const cum3 = compoundReturn(returns, index, 3);
  const down2 = isConsecutive(returns, index, 2, 'down');
  const down3 = isConsecutive(returns, index, 3, 'down');
  const up2 = isConsecutive(returns, index, 2, 'up');
  const up3 = isConsecutive(returns, index, 3, 'up');

  if (up3 && typeof cum3 === 'number' && cum3 >= 0.07) {
    return sellSignal(cum3 >= 0.09 ? 2 : 1.5, '旧版连涨3天减仓', '旧版规则：连涨 3 天累计涨幅超过 7%');
  }
  if (up2 && typeof cum2 === 'number' && cum2 >= 0.04) {
    return sellSignal(1, '旧版连涨2天减仓', '旧版规则：连涨 2 天累计涨幅超过 4%');
  }
  if (current >= 0.02) {
    return sellSignal(0.5, '旧版单日上涨减仓', '旧版规则：单日涨幅超过 2%');
  }

  if (down3 && typeof cum3 === 'number' && cum3 <= -0.06) {
    return buySignal(cum3 <= -0.08 ? 2 : 1.5, '旧版连跌3天加仓', '旧版规则：连跌 3 天累计跌幅超过 6%');
  }
  if (down2 && typeof cum2 === 'number' && cum2 <= -0.03) {
    return buySignal(1, '旧版连跌2天加仓', '旧版规则：连跌 2 天累计跌幅超过 3%');
  }
  if (current <= -0.015 && current >= -0.025) {
    return buySignal(0.5, '旧版单日下跌加仓', '旧版规则：单日跌幅在 1.5% 到 2.5%');
  }

  return holdSignal();
};

const uptrendModeStrategy = (
  rows: FundNavRow[],
  index: number,
  config: StrategyConfig,
  context?: StrategyContext,
): StrategySignal => {
  if (index <= 0) return holdSignal('首日仅建立初始仓位');

  const { current, cum2, cum3, down2, down3, up2, up3 } = getRuleInputs(rows, index);
  const canTrimTrendPosition =
    !context || context.positionRatio > Math.max(config.minPosition, config.uptrendMinPosition) + 0.005;

  if (context && context.positionRatio < config.uptrendMinPosition - 0.005) {
    const parts = partsToReachPosition(config.uptrendMinPosition, context, 'buy');
    if (parts > 0) {
      return buySignal(
        parts,
        '主升浪补足仓位',
        `主升浪仓位低于 ${(config.uptrendMinPosition * 100).toFixed(0)}%，补回趋势底仓`,
      );
    }
  }

  if (up3 && typeof cum3 === 'number' && cum3 >= config.consecutive3RiseThreshold) {
    return canTrimTrendPosition
      ? sellSignal(1, '主升浪连涨3天轻减仓', '连续上涨 3 天且累计涨幅达到阈值，只减 1 份')
      : holdSignal('主升浪仓位已接近趋势底仓，连涨 3 天也暂停减仓');
  }

  if (up2 && typeof cum2 === 'number' && cum2 >= config.consecutive2RiseThreshold) {
    return canTrimTrendPosition
      ? sellSignal(0.5, '主升浪连涨2天轻减仓', '连续上涨 2 天且累计涨幅达到阈值，只减 0.5 份')
      : holdSignal('主升浪仓位已接近趋势底仓，连涨 2 天也暂停减仓');
  }

  if (current >= config.singleDayRiseThreshold) {
    return canTrimTrendPosition
      ? sellSignal(0.25, '主升浪单日上涨轻减仓', '单日涨幅达到减仓阈值，只做小幅止盈')
      : holdSignal('主升浪仓位已接近趋势底仓，单日上涨也暂停减仓');
  }

  if (current <= config.crashDropThreshold) {
    return buySignal(1, '主升浪急跌回补', '主升浪中出现单日急跌，回补 1 份');
  }

  if (down3 && typeof cum3 === 'number' && cum3 <= config.consecutive3DropThreshold) {
    return buySignal(1.5, '主升浪连跌3天回补', '主升浪中连续下跌 3 天，回补趋势仓位');
  }

  if (down2 && typeof cum2 === 'number' && cum2 <= config.consecutive2DropThreshold) {
    return buySignal(1, '主升浪连跌2天回补', '主升浪中连续下跌 2 天，回补趋势仓位');
  }

  if (current <= config.singleDayDropThreshold) {
    return buySignal(0.5, '主升浪单日下跌回补', '主升浪中单日下跌达到加仓阈值，小幅回补');
  }

  return holdSignal();
};

const breakdownModeStrategy = (
  rows: FundNavRow[],
  index: number,
  config: StrategyConfig,
  context?: StrategyContext,
): StrategySignal => {
  if (index <= 0) return holdSignal('首日仅建立初始仓位');

  if (context && context.positionRatio > config.breakdownMaxPosition + 0.005) {
    const parts = partsToReachPosition(config.breakdownMaxPosition, context, 'sell');
    if (parts > 0) {
      return sellSignal(
        parts,
        '破位降到6成以内',
        `破位下跌仓位超过 ${(config.breakdownMaxPosition * 100).toFixed(0)}%，先降到防守上限以内`,
      );
    }
  }

  const { current, cum2, cum3, down2, down3, up2, up3 } = getRuleInputs(rows, index);

  if (up3 && typeof cum3 === 'number' && cum3 >= config.consecutive3RiseThreshold) {
    return sellSignal(2, '破位反弹连涨3天减仓', '破位下跌中的连续反弹，优先降低风险暴露');
  }

  if (up2 && typeof cum2 === 'number' && cum2 >= config.consecutive2RiseThreshold) {
    return sellSignal(1, '破位反弹连涨2天减仓', '破位下跌中的连续反弹，减 1 份');
  }

  if (current >= config.singleDayRiseThreshold) {
    return sellSignal(0.5, '破位单日反弹减仓', '破位下跌中的单日反弹，小幅降低仓位');
  }

  if (current <= config.crashDropThreshold) {
    return buySignal(0.5, '破位单日急跌小加', '破位下跌中只允许急跌小加，避免越跌越重');
  }

  if (down3 && typeof cum3 === 'number' && cum3 <= config.consecutive3DropThreshold) {
    return buySignal(1, '破位连跌3天小加', '破位下跌中连续下跌 3 天也只加 1 份');
  }

  if (down2 && typeof cum2 === 'number' && cum2 <= config.consecutive2DropThreshold) {
    return buySignal(0.5, '破位连跌2天小加', '破位下跌中连续下跌 2 天只小加 0.5 份');
  }

  if (current <= config.singleDayDropThreshold) {
    return buySignal(0.25, '破位单日下跌小加', '破位下跌中单日下跌只试探加仓');
  }

  return holdSignal();
};

export const adaptiveProfitStrategy = (
  rows: FundNavRow[],
  index: number,
  config: StrategyConfig,
  marketRegime: MarketRegime,
  context?: StrategyContext,
): StrategySignal => {
  if (marketRegime === 'uptrend') {
    return getModeSignal(uptrendModeStrategy(rows, index, config, context), '主升浪模式');
  }
  if (marketRegime === 'breakdown') {
    return getModeSignal(breakdownModeStrategy(rows, index, config, context), '破位下跌模式');
  }
  return getModeSignal(oldRuleStrategy(rows, index, config), '震荡模式收益优先');
};

export const adaptiveDefensiveStrategy = (
  rows: FundNavRow[],
  index: number,
  config: StrategyConfig,
  marketRegime: MarketRegime,
  context?: StrategyContext,
): StrategySignal => {
  if (marketRegime === 'uptrend') {
    return getModeSignal(uptrendModeStrategy(rows, index, config, context), '主升浪模式');
  }
  if (marketRegime === 'breakdown') {
    return getModeSignal(breakdownModeStrategy(rows, index, config, context), '破位下跌模式');
  }
  return getModeSignal(newRuleStrategy(rows, index, config, marketRegime), '震荡模式稳健防守');
};

export const getStrategySignal = (
  strategyId: StrategyId,
  rows: FundNavRow[],
  index: number,
  config: StrategyConfig,
  marketRegime: MarketRegime,
  context?: StrategyContext,
) => {
  if (strategyId === 'adaptive_profit_strategy') {
    return adaptiveProfitStrategy(rows, index, config, marketRegime, context);
  }
  if (strategyId === 'adaptive_defensive_strategy') {
    return adaptiveDefensiveStrategy(rows, index, config, marketRegime, context);
  }
  if (strategyId === 'new_rule_strategy') return newRuleStrategy(rows, index, config, marketRegime);
  if (strategyId === 'old_rule_strategy') return oldRuleStrategy(rows, index, config);
  return holdSignal(strategyId === 'buy_and_hold' ? '买入并持有，不再操作' : '固定仓位策略，不再操作');
};
