import { DEFAULT_STRATEGY_CONFIG, OPTIMIZER_GRID } from '../config';
import type { FundNavRow, OptimizerObjective, OptimizerResult, StrategyConfig } from '../types';
import { runBacktest } from './engine';

export type OptimizeProgress = {
  completed: number;
  total: number;
};

const scoreByObjective = (result: ReturnType<typeof runBacktest>, objective: OptimizerObjective) => {
  if (objective === 'totalReturn') return result.metrics.totalReturn;
  if (objective === 'sharpeRatio') return result.metrics.sharpeRatio;
  const denominator = Math.abs(result.metrics.maxDrawdown);
  return denominator > 0 ? result.metrics.totalReturn / denominator : result.metrics.totalReturn * 100;
};

export const optimizeParameters = (
  rows: FundNavRow[],
  baseConfig: StrategyConfig = DEFAULT_STRATEGY_CONFIG,
  objective: OptimizerObjective = 'returnDrawdownRatio',
  onProgress?: (progress: OptimizeProgress) => void,
) => {
  const results: OptimizerResult[] = [];
  const grid = OPTIMIZER_GRID;
  const total =
    grid.singleDayDropThreshold.length *
    grid.consecutive2DropThreshold.length *
    grid.consecutive3DropThreshold.length *
    grid.singleDayRiseThreshold.length *
    grid.consecutive2RiseThreshold.length *
    grid.consecutive3RiseThreshold.length *
    grid.initialPosition.length *
    grid.maxPosition.length *
    grid.minPosition.length;

  let completed = 0;

  for (const singleDayDropThreshold of grid.singleDayDropThreshold) {
    for (const consecutive2DropThreshold of grid.consecutive2DropThreshold) {
      for (const consecutive3DropThreshold of grid.consecutive3DropThreshold) {
        for (const singleDayRiseThreshold of grid.singleDayRiseThreshold) {
          for (const consecutive2RiseThreshold of grid.consecutive2RiseThreshold) {
            for (const consecutive3RiseThreshold of grid.consecutive3RiseThreshold) {
              for (const initialPosition of grid.initialPosition) {
                for (const maxPosition of grid.maxPosition) {
                  for (const minPosition of grid.minPosition) {
                    if (minPosition >= initialPosition || initialPosition >= maxPosition) {
                      completed += 1;
                      continue;
                    }

                    const config: StrategyConfig = {
                      ...baseConfig,
                      singleDayDropThreshold,
                      consecutive2DropThreshold,
                      consecutive3DropThreshold,
                      singleDayRiseThreshold,
                      consecutive2RiseThreshold,
                      consecutive3RiseThreshold,
                      initialPosition,
                      maxPosition,
                      minPosition,
                    };

                    const backtest = runBacktest(rows, 'new_rule_strategy', config);
                    const score = scoreByObjective(backtest, objective);
                    results.push({
                      rank: 0,
                      objective,
                      score,
                      metrics: backtest.metrics,
                      config,
                    });

                    completed += 1;
                    if (completed % 250 === 0) onProgress?.({ completed, total });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  onProgress?.({ completed: total, total });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((item, index) => ({ ...item, rank: index + 1 }));
};
