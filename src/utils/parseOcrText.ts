import type { FundNavRow } from '../types';
import { recalculateDailyReturns, sortRowsByDate, uid } from './format';

const toHalfWidth = (text: string) =>
  text.replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');

const normalizeNumberText = (value: string) =>
  toHalfWidth(value)
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[，,]/g, '.')
    .replace(/[＋]/g, '+')
    .replace(/[－—–]/g, '-')
    .replace(/\s+/g, '');

export const normalizeOcrDate = (value: string) => {
  const normalized = toHalfWidth(value)
    .replace(/[年月]/g, '-')
    .replace(/日/g, '')
    .replace(/[./]/g, '-')
    .replace(/\s+/g, '');
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const parseNumericToken = (value: string) => {
  const normalized = normalizeNumberText(value).replace(/%/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const lineDateRegex =
  /((?:19|20)\d{2}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?)/;

const signedPercentRegex = /[+\-]\s*\d+(?:[.,]\d+)?\s*%?/;

/**
 * 从 OCR 文本中提取净值记录。识别不到日涨幅时，后续会用相邻净值补算。
 */
export const parseOcrText = (text: string): FundNavRow[] => {
  const cleaned = toHalfWidth(text)
    .replace(/[＋]/g, '+')
    .replace(/[－—–]/g, '-')
    .replace(/[|]/g, ' ')
    .replace(/\t/g, ' ');

  const rows: FundNavRow[] = [];

  cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const dateMatch = line.match(lineDateRegex);
      if (!dateMatch) return;

      const dateText = dateMatch[1];
      if (!dateText) return;

      const date = normalizeOcrDate(dateText);
      if (!date) return;

      const afterDate = line.slice((dateMatch.index ?? 0) + dateText.length);
      const numericTokens = afterDate.match(/[+\-]?\s*\d+(?:[.,]\d+)?\s*%?/g) ?? [];
      if (numericTokens.length === 0) return;

      const navToken = numericTokens[0];
      if (!navToken) return;
      const nav = parseNumericToken(navToken);
      if (typeof nav !== 'number' || nav <= 0 || nav > 100) return;

      const percentToken =
        afterDate.match(signedPercentRegex)?.[0] ??
        numericTokens.find((token, index) => index > 0 && token.includes('%')) ??
        numericTokens[1];
      const parsedPercent = percentToken ? parseNumericToken(percentToken) : undefined;
      const dailyReturn =
        typeof parsedPercent === 'number' && Math.abs(parsedPercent) <= 50 ? parsedPercent / 100 : undefined;

      rows.push({
        id: uid(),
        date,
        nav,
        dailyReturn,
        rawText: line,
      });
    });

  const deduped = new Map<string, FundNavRow>();
  rows.forEach((row) => {
    const existing = deduped.get(row.date);
    if (!existing || (existing.dailyReturn === undefined && row.dailyReturn !== undefined)) {
      deduped.set(row.date, row);
    }
  });

  return recalculateMissingDailyReturn(sortRowsByDate([...deduped.values()]));
};

export const recalculateMissingDailyReturn = (rows: FundNavRow[]) => {
  const recalculated = recalculateDailyReturns(rows);
  return rows.map((row, index) =>
    row.dailyReturn === undefined ? { ...row, dailyReturn: recalculated[index]?.dailyReturn ?? 0 } : row,
  );
};
