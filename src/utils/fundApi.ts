import type { FundDataSet, FundNavRow } from '../types';
import { uid } from './format';

type EastmoneyNetWorthPoint = {
  x: number;
  y: number;
  equityReturn?: number;
  unitMoney?: string;
};

declare global {
  interface Window {
    fS_name?: string;
    fS_code?: string;
    Data_netWorthTrend?: EastmoneyNetWorthPoint[];
    Data_ACWorthTrend?: Array<[number, number]>;
  }
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const cleanupGlobals = () => {
  window.fS_name = undefined;
  window.fS_code = undefined;
  window.Data_netWorthTrend = undefined;
  window.Data_ACWorthTrend = undefined;
};

const loadEastmoneyFundScript = (fundCode: string) =>
  new Promise<void>((resolve, reject) => {
    cleanupGlobals();
    const script = document.createElement('script');
    script.src = `https://fund.eastmoney.com/pingzhongdata/${fundCode}.js?v=${Date.now()}`;
    script.async = true;
    script.charset = 'utf-8';
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`基金 ${fundCode} 数据加载失败，请检查基金代码或稍后重试。`));
    };
    document.head.appendChild(script);
  });

const calculatePeriodReturn = (rows: FundNavRow[]) => {
  if (rows.length < 2) return 0;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const startValue = first.cumulativeNav ?? first.nav;
  const endValue = last.cumulativeNav ?? last.nav;
  return startValue > 0 ? endValue / startValue - 1 : 0;
};

/**
 * 通过基金代码加载近期净值。该接口以 script 方式载入公开页面数据，适合 GitHub Pages 纯前端使用。
 */
export const fetchFundRecentNav = async (fundCode: string, recentDays: number): Promise<FundDataSet> => {
  const code = fundCode.trim();
  if (!/^\d{6}$/.test(code)) throw new Error(`基金代码 ${fundCode} 格式不正确，应为 6 位数字。`);

  await loadEastmoneyFundScript(code);

  const netWorthTrend = window.Data_netWorthTrend ?? [];
  const cumulativeMap = new Map<number, number>((window.Data_ACWorthTrend ?? []).map(([time, value]) => [time, value]));
  const fundName = window.fS_name || code;
  if (!netWorthTrend.length) throw new Error(`基金 ${code} 未返回历史净值数据。`);

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Math.max(1, recentDays) + 1);

  const filtered = netWorthTrend
    .filter((point) => point.x >= cutoff.getTime())
    .sort((a, b) => a.x - b.x);

  const sourcePoints = filtered.length ? filtered : netWorthTrend.slice(-Math.max(1, recentDays));
  const rows: FundNavRow[] = sourcePoints.map((point, index) => {
    const previous = sourcePoints[index - 1];
    const fallbackReturn = previous?.y ? point.y / previous.y - 1 : 0;
    const dailyReturn =
      typeof point.equityReturn === 'number' && Number.isFinite(point.equityReturn)
        ? point.equityReturn / 100
        : fallbackReturn;

    return {
      id: uid(),
      date: formatDate(point.x),
      nav: point.y,
      cumulativeNav: cumulativeMap.get(point.x),
      dailyReturn,
      rawText: `${code} ${fundName}`,
    };
  });

  cleanupGlobals();

  return {
    id: `code-${code}`,
    fundName,
    fundCode: code,
    source: 'fund-code',
    rows,
    recentDays,
    actualTradingDays: rows.length,
    periodReturn: calculatePeriodReturn(rows),
    startDate: rows[0]?.date,
    endDate: rows[rows.length - 1]?.date,
  };
};

export const parseFundCodes = (value: string) =>
  Array.from(new Set(value.match(/\d{6}/g) ?? []));
