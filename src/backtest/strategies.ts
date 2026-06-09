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

export const getMaxPositionAllowed = (config: StrategyConfig, marketRegime: MarketRegime) =>
  marketRegime === 'breakdown' ? Math.min(config.maxPosition, config.breakdownMaxPosition) : config.maxPosition;

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

export const getStrategySignal = (
  strategyId: StrategyId,
  rows: FundNavRow[],
  index: number,
  config: StrategyConfig,
  marketRegime: MarketRegime,
) => {
  if (strategyId === 'new_rule_strategy') return newRuleStrategy(rows, index, config, marketRegime);
  if (strategyId === 'old_rule_strategy') return oldRuleStrategy(rows, index, config);
  return holdSignal(strategyId === 'buy_and_hold' ? '买入并持有，不再操作' : '固定仓位策略，不再操作');
};
