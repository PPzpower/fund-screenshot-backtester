import type { FundNavRow, MarketRegime } from '../types';

export const movingAverage = (values: number[], period: number) => {
  const result: Array<number | undefined> = [];
  let sum = 0;

  values.forEach((value, index) => {
    sum += value;
    if (index >= period) sum -= values[index - period];
    result.push(index >= period - 1 ? sum / period : undefined);
  });

  return result;
};

export const compoundReturn = (returns: number[], endIndex: number, days: number) => {
  if (endIndex - days + 1 < 0) return undefined;
  let value = 1;
  for (let index = endIndex - days + 1; index <= endIndex; index += 1) {
    value *= 1 + returns[index];
  }
  return value - 1;
};

export const isConsecutive = (returns: number[], endIndex: number, days: number, direction: 'up' | 'down') => {
  if (endIndex - days + 1 < 0) return false;
  for (let index = endIndex - days + 1; index <= endIndex; index += 1) {
    if (direction === 'up' && returns[index] <= 0) return false;
    if (direction === 'down' && returns[index] >= 0) return false;
  }
  return true;
};

export type IndicatorSet = {
  ma20: Array<number | undefined>;
  ma60: Array<number | undefined>;
  recent5Return: Array<number | undefined>;
  regimes: MarketRegime[];
};

export const buildIndicators = (rows: FundNavRow[]): IndicatorSet => {
  const navs = rows.map((row) => row.nav);
  const returns = rows.map((row) => row.dailyReturn ?? 0);
  const ma20 = movingAverage(navs, 20);
  const ma60 = movingAverage(navs, 60);
  const recent5Return = returns.map((_, index) => compoundReturn(returns, index, 5));

  const regimes: MarketRegime[] = rows.map((row, index) => {
    const m20 = ma20[index];
    const m60 = ma60[index];
    const prevM20 = ma20[index - 1];
    const fiveDay = recent5Return[index];
    const ma20Down = typeof m20 === 'number' && typeof prevM20 === 'number' && m20 < prevM20;

    if (typeof m20 === 'number' && typeof m60 === 'number' && typeof fiveDay === 'number') {
      if (row.nav > m20 && m20 > m60 && fiveDay > 0) return 'uptrend';
      if ((row.nav < m20 && ma20Down) || m20 < m60) return 'breakdown';
    }

    if (typeof m20 === 'number' && row.nav < m20 && ma20Down) return 'breakdown';
    return 'sideways';
  });

  return { ma20, ma60, recent5Return, regimes };
};
