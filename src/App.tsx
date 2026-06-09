import { useMemo, useState } from 'react';
import { DEFAULT_STRATEGY_CONFIG, STRATEGY_NAMES } from './config';
import { runAllStrategies } from './backtest/engine';
import { AssetChart } from './components/AssetChart';
import { DrawdownChart } from './components/DrawdownChart';
import { ImageUploader } from './components/ImageUploader';
import { MetricsTable } from './components/MetricsTable';
import { OcrTextPreview } from './components/OcrTextPreview';
import { ParsedDataEditor } from './components/ParsedDataEditor';
import { PositionChart } from './components/PositionChart';
import { StrategyConfigPanel } from './components/StrategyConfigPanel';
import { TradeLogTable } from './components/TradeLogTable';
import { TradeSignalChart } from './components/TradeSignalChart';
import type {
  BacktestResult,
  BacktestRow,
  FundNavRow,
  MarketRegime,
  OcrProgress,
  ScreenshotImport,
  StrategyConfig,
  StrategyId,
} from './types';
import { recognizeScreenshot } from './utils/ocr';
import { parseOcrText } from './utils/parseOcrText';
import { calculateMetrics } from './utils/metrics';
import {
  backtestRowsToCsv,
  downloadCsv,
  formatMoney,
  formatPercent,
  normalizeRowsForBacktest,
  toCsv,
  uid,
} from './utils/format';

const idleProgress: OcrProgress = {
  stage: 'idle',
  label: '等待上传截图',
  progress: 0,
};

const strategyIds: StrategyId[] = [
  'buy_and_hold',
  'fixed_50_percent',
  'old_rule_strategy',
  'new_rule_strategy',
];

type FundBacktestBundle = {
  fundId: string;
  fundName: string;
  rows: FundNavRow[];
  results: BacktestResult[];
};

type PortfolioBacktest = {
  funds: FundBacktestBundle[];
  results: BacktestResult[];
  newRuleTradeRows: BacktestRow[];
};

const stripExtension = (filename: string) => filename.replace(/\.[^.]+$/, '');

const buildAllRecordsCsv = (results: BacktestResult[]) =>
  toCsv(
    [
      '策略',
      '日期',
      '净值',
      '日涨幅',
      '现金',
      '份额',
      '持仓市值',
      '总资产',
      '仓位',
      '操作',
      '交易金额',
      '交易类型',
      '市场状态',
      '信号原因',
      '允许最高仓位',
      '累计收益',
      '回撤',
    ],
    results.flatMap((result) =>
      result.rows.map((row) => [
        result.strategyName,
        row.date,
        row.nav,
        formatPercent(row.dailyReturn),
        row.cash.toFixed(2),
        row.fundUnits.toFixed(4),
        row.holdingValue.toFixed(2),
        row.totalAsset.toFixed(2),
        formatPercent(row.positionRatio),
        row.action,
        row.tradeAmount.toFixed(2),
        row.tradeType,
        row.marketRegime,
        row.signalReason,
        formatPercent(row.maxPositionAllowed),
        formatPercent(row.cumulativeReturn),
        formatPercent(row.drawdown),
      ]),
    ),
  );

const getDominantRegime = (rows: BacktestRow[]): MarketRegime => {
  if (rows.some((row) => row.marketRegime === 'breakdown')) return 'breakdown';
  if (rows.some((row) => row.marketRegime === 'uptrend')) return 'uptrend';
  return 'sideways';
};

const aggregateStrategyResults = (
  strategyId: StrategyId,
  fundResults: Array<{ fundName: string; result: BacktestResult }>,
  totalInitialCash: number,
): BacktestResult => {
  const dates = Array.from(
    new Set(fundResults.flatMap(({ result }) => result.rows.map((row) => row.date))),
  ).sort();
  const sleeveCash = fundResults.length ? totalInitialCash / fundResults.length : totalInitialCash;
  const pointers = fundResults.map(() => 0);
  let previousTotalAsset = totalInitialCash;
  let peakAsset = totalInitialCash;

  const rows: BacktestRow[] = dates.map((date, dateIndex) => {
    const latestRows = fundResults.map(({ result }, fundIndex) => {
      while (
        pointers[fundIndex] < result.rows.length &&
        result.rows[pointers[fundIndex]].date <= date
      ) {
        pointers[fundIndex] += 1;
      }
      return result.rows[pointers[fundIndex] - 1];
    });

    const exactRows = fundResults.flatMap(({ result }) => result.rows.filter((row) => row.date === date));
    const tradeRows = exactRows.filter((row) => row.action !== 'hold' && row.tradeAmount > 0);
    const buyAmount = tradeRows
      .filter((row) => row.action === 'buy')
      .reduce((sum, row) => sum + row.tradeAmount, 0);
    const sellAmount = tradeRows
      .filter((row) => row.action === 'sell')
      .reduce((sum, row) => sum + row.tradeAmount, 0);

    const cash = latestRows.reduce((sum, row) => sum + (row?.cash ?? sleeveCash), 0);
    const holdingValue = latestRows.reduce((sum, row) => sum + (row?.holdingValue ?? 0), 0);
    const totalAsset = cash + holdingValue;
    const positionRatio = totalAsset > 0 ? holdingValue / totalAsset : 0;
    const dailyReturn = dateIndex === 0 ? 0 : totalAsset / previousTotalAsset - 1;
    previousTotalAsset = totalAsset;
    peakAsset = Math.max(peakAsset, totalAsset);

    const action = buyAmount > sellAmount ? 'buy' : sellAmount > buyAmount ? 'sell' : 'hold';
    const tradeAmount = buyAmount + sellAmount;

    return {
      date,
      nav: 1 + (totalAsset / totalInitialCash - 1),
      dailyReturn,
      cash,
      fundUnits: 0,
      holdingValue,
      totalAsset,
      positionRatio,
      action,
      tradeAmount,
      tradeType: tradeRows.length ? '组合交易汇总' : 'hold',
      marketRegime: getDominantRegime(exactRows.length ? exactRows : latestRows.filter(Boolean)),
      signalReason: tradeRows.length ? `当日组合内 ${tradeRows.length} 笔交易` : '组合未触发交易',
      maxPositionAllowed: latestRows.length
        ? latestRows.reduce((sum, row) => sum + (row?.maxPositionAllowed ?? 0), 0) / latestRows.length
        : 0,
      cumulativeReturn: totalAsset / totalInitialCash - 1,
      drawdown: peakAsset > 0 ? totalAsset / peakAsset - 1 : 0,
    };
  });

  const strategyName = `${STRATEGY_NAMES[strategyId]}（组合）`;
  return {
    strategyId,
    strategyName,
    rows,
    metrics: calculateMetrics(strategyName, rows, totalInitialCash),
  };
};

const runPortfolioBacktest = (
  screenshots: ScreenshotImport[],
  config: StrategyConfig,
): PortfolioBacktest => {
  const validFunds = screenshots
    .map((item) => ({
      fundId: item.id,
      fundName: item.fundName.trim() || item.name,
      rows: normalizeRowsForBacktest(item.parsedRows),
    }))
    .filter((item) => item.rows.length > 0);

  const sleeveCash = validFunds.length ? config.initialCash / validFunds.length : config.initialCash;
  const funds: FundBacktestBundle[] = validFunds.map((fund) => ({
    ...fund,
    results: runAllStrategies(fund.rows, { ...config, initialCash: sleeveCash }),
  }));

  const results = strategyIds.map((strategyId) =>
    aggregateStrategyResults(
      strategyId,
      funds.map((fund) => ({
        fundName: fund.fundName,
        result: fund.results.find((result) => result.strategyId === strategyId)!,
      })),
      config.initialCash,
    ),
  );

  const newRuleTradeRows = funds
    .flatMap((fund) => {
      const result = fund.results.find((item) => item.strategyId === 'new_rule_strategy');
      return (result?.rows ?? [])
        .filter((row) => row.action !== 'hold' && row.tradeAmount > 0)
        .map((row) => ({ ...row, fundName: fund.fundName }));
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.fundName ?? '').localeCompare(b.fundName ?? ''));

  return { funds, results, newRuleTradeRows };
};

export default function App() {
  const [screenshots, setScreenshots] = useState<ScreenshotImport[]>([]);
  const [activeScreenshotId, setActiveScreenshotId] = useState<string>();
  const [portfolio, setPortfolio] = useState<PortfolioBacktest>();
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [progress, setProgress] = useState<OcrProgress>(idleProgress);
  const [error, setError] = useState('');
  const [isRecognizing, setIsRecognizing] = useState(false);

  const activeScreenshot = useMemo(
    () => screenshots.find((item) => item.id === activeScreenshotId) ?? screenshots[0],
    [activeScreenshotId, screenshots],
  );
  const results = portfolio?.results ?? [];
  const newRuleResult = useMemo(
    () => results.find((result) => result.strategyId === 'new_rule_strategy'),
    [results],
  );

  const updateScreenshot = (id: string, patch: Partial<ScreenshotImport>) => {
    setScreenshots((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const handleFilesChange = (files: File[]) => {
    screenshots.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    const nextScreenshots = files.map((file): ScreenshotImport => ({
      id: uid(),
      fundName: stripExtension(file.name),
      name: file.name,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
      ocrText: '',
      parsedRows: [],
    }));
    setScreenshots(nextScreenshots);
    setActiveScreenshotId(nextScreenshots[0]?.id);
    setPortfolio(undefined);
    setError('');
    setProgress(idleProgress);
  };

  const resetUpload = () => {
    screenshots.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setScreenshots([]);
    setActiveScreenshotId(undefined);
    setPortfolio(undefined);
    setError('');
    setProgress(idleProgress);
  };

  const startOcr = async () => {
    if (!screenshots.length) return;
    setIsRecognizing(true);
    setError('');
    setPortfolio(undefined);

    try {
      for (let index = 0; index < screenshots.length; index += 1) {
        const screenshot = screenshots[index];
        if (!screenshot) continue;

        setActiveScreenshotId(screenshot.id);
        updateScreenshot(screenshot.id, { status: 'recognizing', error: undefined });

        const text = await recognizeScreenshot(screenshot.file, (nextProgress) => {
          setProgress({
            ...nextProgress,
            label: `第 ${index + 1}/${screenshots.length} 只基金 ${screenshot.fundName}：${nextProgress.label}`,
            progress: (index + nextProgress.progress) / screenshots.length,
          });
        });
        const rows = parseOcrText(text);

        updateScreenshot(screenshot.id, {
          status: 'done',
          ocrText: text,
          parsedRows: rows,
        });
      }

      setProgress({
        stage: 'done',
        label: `已识别 ${screenshots.length} 只基金，请逐只核对后开始组合回测`,
        progress: 1,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'OCR 识别失败，请更换清晰截图后重试。';
      setScreenshots((current) =>
        current.map((item) => (item.status === 'recognizing' ? { ...item, status: 'error', error: message } : item)),
      );
      setError(message);
    } finally {
      setIsRecognizing(false);
    }
  };

  const parseTextAgain = () => {
    if (!activeScreenshot) return;
    const rows = parseOcrText(activeScreenshot.ocrText);
    updateScreenshot(activeScreenshot.id, { parsedRows: rows, status: rows.length ? 'done' : 'error' });
    setProgress({
      stage: 'parse',
      label: `${activeScreenshot.fundName} 已重新解析 ${rows.length} 条净值记录`,
      progress: 1,
    });
    if (!rows.length) setError('未解析到净值行，请检查日期、净值和日涨幅是否在同一行附近。');
    else setError('');
  };

  const confirmAndBacktest = () => {
    const nextPortfolio = runPortfolioBacktest(screenshots, config);
    setPortfolio(nextPortfolio);
    if (!nextPortfolio.funds.length) {
      setError('还没有任何基金拥有可回测的净值数据，请先完成 OCR 并核对表格。');
    } else {
      setError('');
    }
  };

  const rerunBacktest = () => {
    if (!screenshots.some((item) => item.parsedRows.length)) return;
    setPortfolio(runPortfolioBacktest(screenshots, config));
  };

  const activeRows = activeScreenshot?.parsedRows ?? [];
  const activeOcrText = activeScreenshot?.ocrText ?? '';
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="app-header">
          <div>
            <h1>A股科技基金截图回测模拟器</h1>
            <p>批量上传多只基金净值截图，把它们作为一个组合一起回测加仓减仓策略。</p>
          </div>
          {results.length > 0 && (
            <div className="header-stat">
              <span>组合新版策略期末资产</span>
              <strong>{formatMoney(newRuleResult?.metrics.finalAsset ?? 0)}</strong>
              <small>{formatPercent(newRuleResult?.metrics.totalReturn)}</small>
            </div>
          )}
        </header>

        <section className="section">
          <div className="section-header">
            <div>
              <h2>组合回测口径</h2>
              <p>每张截图代表一只基金；初始资金会平均分配到所有基金资金槽。</p>
            </div>
          </div>
          <div className="grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-2">
            <p>
              每只基金按照自己的净值涨跌独立触发加仓/减仓信号，最后汇总为整个组合的资产、回撤、仓位和交易日志。
            </p>
            <p>
              场外基金一般按交易日收盘净值确认；本模拟器默认用当天净值成交，实盘会受到确认延迟、费率和净值更新滞后的影响。
            </p>
          </div>
        </section>

        <ImageUploader
          screenshots={screenshots}
          activeScreenshotId={activeScreenshotId}
          progress={progress}
          error={error}
          isRecognizing={isRecognizing}
          onFilesChange={handleFilesChange}
          onSelectScreenshot={setActiveScreenshotId}
          onRenameScreenshot={(id, fundName) => updateScreenshot(id, { fundName })}
          onStart={startOcr}
          onReset={resetUpload}
        />

        {activeScreenshot && (
          <section className="section">
            <div className="section-header">
              <div>
                <h2>当前核对基金</h2>
                <p>{activeScreenshot.fundName}。请在上方缩略图切换其他基金逐只核对。</p>
              </div>
            </div>
          </section>
        )}

        <OcrTextPreview
          text={activeOcrText}
          onTextChange={(text) => activeScreenshot && updateScreenshot(activeScreenshot.id, { ocrText: text })}
          onParse={parseTextAgain}
        />

        <ParsedDataEditor
          rows={activeRows}
          onRowsChange={(rows) => activeScreenshot && updateScreenshot(activeScreenshot.id, { parsedRows: rows })}
          onConfirm={confirmAndBacktest}
          title={activeScreenshot ? `${activeScreenshot.fundName} 净值数据` : '确认净值数据'}
          description="当前表格只属于选中的这只基金。多只基金不会合并日期；确认后会作为一个组合一起回测。"
          confirmLabel="确认全部基金并开始组合回测"
          confirmDisabled={!screenshots.some((item) => item.parsedRows.length)}
        />

        <StrategyConfigPanel config={config} onChange={setConfig} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="primary-button" disabled={!portfolio?.funds.length} onClick={rerunBacktest}>
            使用当前参数重新组合回测
          </button>
          <button
            className="secondary-button"
            disabled={!results.length}
            onClick={() => downloadCsv('portfolio-backtest-records.csv', buildAllRecordsCsv(results))}
          >
            导出组合每日记录 CSV
          </button>
          <button
            className="secondary-button"
            disabled={!newRuleResult?.rows.length}
            onClick={() => downloadCsv('portfolio-new-rule-records.csv', backtestRowsToCsv(newRuleResult?.rows ?? []))}
          >
            导出组合新版策略每日记录 CSV
          </button>
        </div>

        <MetricsTable results={results} />

        {results.length > 0 && (
          <div className="grid gap-6 xl:grid-cols-2">
            <AssetChart results={results} />
            <DrawdownChart results={results} />
            {newRuleResult && <PositionChart rows={newRuleResult.rows} />}
            {newRuleResult && <TradeSignalChart rows={newRuleResult.rows} />}
          </div>
        )}

        {portfolio && <TradeLogTable rows={portfolio.newRuleTradeRows} />}

        <section className="section">
          <div className="section-header">
            <div>
              <h2>组合参数优化</h2>
              <p>组合回测口径已经改为多基金一起计算；参数优化也需要按组合口径重写，避免用单只基金结果误导判断。</p>
            </div>
          </div>
          <div className="notice">
            当前版本先输出组合回测、组合曲线和组合交易日志。下一步可以把参数优化改成“多基金组合目标函数”，按组合总收益、组合夏普和组合收益回撤比搜索参数。
          </div>
        </section>
      </div>
    </main>
  );
}
