export type MarketRegime = 'uptrend' | 'sideways' | 'breakdown';

export type TradeAction = 'buy' | 'sell' | 'hold';

export type StrategyId =
  | 'buy_and_hold'
  | 'fixed_50_percent'
  | 'old_rule_strategy'
  | 'new_rule_strategy';

export type FundNavRow = {
  id: string;
  date: string;
  nav: number;
  dailyReturn?: number;
  rawText?: string;
};

export type ParsedValidation = {
  status: 'valid' | 'warning' | 'error';
  messages: string[];
};

export type StrategyConfig = {
  initialCash: number;
  initialPosition: number;
  minPosition: number;
  maxPosition: number;
  breakdownMaxPosition: number;
  buyFee: number;
  sellFee: number;
  singleDayDropThreshold: number;
  consecutive2DropThreshold: number;
  consecutive3DropThreshold: number;
  crashDropThreshold: number;
  singleDayRiseThreshold: number;
  consecutive2RiseThreshold: number;
  consecutive3RiseThreshold: number;
  uptrendSellHalf: boolean;
};

export type BacktestRow = {
  date: string;
  nav: number;
  dailyReturn: number;
  cash: number;
  fundUnits: number;
  holdingValue: number;
  totalAsset: number;
  positionRatio: number;
  action: TradeAction;
  tradeAmount: number;
  tradeType: string;
  marketRegime: MarketRegime;
  signalReason: string;
  maxPositionAllowed: number;
  cumulativeReturn: number;
  drawdown: number;
};

export type StrategyMetrics = {
  strategyName: string;
  finalAsset: number;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  volatility: number;
  sharpeRatio: number;
  tradeCount: number;
  winRate: number;
  avgPosition: number;
  maxPosition: number;
  minPosition: number;
  cashUtilization: number;
  bestDayReturn: number;
  worstDayReturn: number;
  longestDrawdownDays: number;
};

export type BacktestResult = {
  strategyId: StrategyId;
  strategyName: string;
  rows: BacktestRow[];
  metrics: StrategyMetrics;
};

export type OptimizerObjective = 'totalReturn' | 'sharpeRatio' | 'returnDrawdownRatio';

export type OptimizerResult = {
  rank: number;
  objective: OptimizerObjective;
  score: number;
  metrics: StrategyMetrics;
  config: StrategyConfig;
};

export type OcrProgress = {
  stage: 'idle' | 'preprocess' | 'recognize' | 'parse' | 'done' | 'error';
  label: string;
  progress: number;
};
