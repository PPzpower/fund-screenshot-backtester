import type { FundNavRow, OptimizerObjective, StrategyConfig } from '../types';
import { optimizeParameters } from '../backtest/optimizer';

type StartMessage = {
  type: 'start';
  rows: FundNavRow[];
  config: StrategyConfig;
  objective: OptimizerObjective;
};

self.onmessage = (event: MessageEvent<StartMessage>) => {
  if (event.data.type !== 'start') return;
  const { rows, config, objective } = event.data;

  try {
    const results = optimizeParameters(rows, config, objective, (progress) => {
      self.postMessage({ type: 'progress', progress });
    });
    self.postMessage({ type: 'complete', results });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : '参数优化失败',
    });
  }
};

export {};
