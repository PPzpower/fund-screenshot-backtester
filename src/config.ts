import type { StrategyConfig, StrategyId } from './types';

export const REPOSITORY_NAME = 'fund-screenshot-backtester';

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  initialCash: 100000,
  initialPosition: 0.5,
  minPosition: 0.3,
  maxPosition: 0.85,
  breakdownMaxPosition: 0.6,
  buyFee: 0.0015,
  sellFee: 0.0015,
  singleDayDropThreshold: -0.018,
  consecutive2DropThreshold: -0.035,
  consecutive3DropThreshold: -0.055,
  crashDropThreshold: -0.04,
  singleDayRiseThreshold: 0.025,
  consecutive2RiseThreshold: 0.04,
  consecutive3RiseThreshold: 0.06,
  uptrendSellHalf: true,
};

export const STRATEGY_NAMES: Record<StrategyId, string> = {
  buy_and_hold: '买入并持有',
  fixed_50_percent: '固定 50% 仓位',
  old_rule_strategy: '旧版加减仓规则',
  new_rule_strategy: '新版趋势过滤策略',
};

export const OPTIMIZER_GRID = {
  singleDayDropThreshold: [-0.015, -0.018, -0.02, -0.025],
  consecutive2DropThreshold: [-0.03, -0.035, -0.04, -0.05],
  consecutive3DropThreshold: [-0.05, -0.055, -0.06, -0.07],
  singleDayRiseThreshold: [0.02, 0.025, 0.03],
  consecutive2RiseThreshold: [0.04, 0.05, 0.06],
  consecutive3RiseThreshold: [0.06, 0.07, 0.08],
  initialPosition: [0.4, 0.5, 0.6],
  maxPosition: [0.8, 0.85, 0.9],
  minPosition: [0.2, 0.3, 0.4],
};

export const DAILY_RETURN_WARNING_RANGE = {
  min: -0.2,
  max: 0.2,
};
