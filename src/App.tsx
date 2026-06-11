import { useMemo, useState } from 'react';
import { DEFAULT_STRATEGY_CONFIG, STRATEGY_NAMES } from './config';
import { runAllStrategies } from './backtest/engine';
import { AssetChart } from './components/AssetChart';
import { DrawdownChart } from './components/DrawdownChart';
import { FundCodeImporter } from './components/FundCodeImporter';
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
  FundDataSet,
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

const availableStrategyIds: StrategyId[] = [
  'buy_and_hold',
  'fixed_50_percent',
  'old_rule_strategy',
  'new_rule_strategy',
  'adaptive_profit_strategy',
  'adaptive_defensive_strategy',
];

const defaultFocusedStrategyId: StrategyId = 'adaptive_profit_strategy';

type FundBacktestBundle = {
  fundId: string;
  fundName: string;
  rows: FundNavRow[];
  results: BacktestResult[];
};

type PortfolioBacktest = {
  funds: FundBacktestBundle[];
  results: BacktestResult[];
  featuredTradeRows: BacktestRow[];
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
  const isPortfolio = fundResults.length > 1;
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
      tradeType: tradeRows.length ? (isPortfolio ? '组合交易汇总' : tradeRows[0].tradeType) : 'hold',
      marketRegime: getDominantRegime(exactRows.length ? exactRows : latestRows.filter(Boolean)),
      signalReason: tradeRows.length
        ? isPortfolio
          ? `当日组合内 ${tradeRows.length} 笔交易`
          : tradeRows[0].signalReason
        : '未触发交易',
      maxPositionAllowed: latestRows.length
        ? latestRows.reduce((sum, row) => sum + (row?.maxPositionAllowed ?? 0), 0) / latestRows.length
        : 0,
      cumulativeReturn: totalAsset / totalInitialCash - 1,
      drawdown: peakAsset > 0 ? totalAsset / peakAsset - 1 : 0,
    };
  });

  const strategyName = isPortfolio ? `${STRATEGY_NAMES[strategyId]}（组合）` : STRATEGY_NAMES[strategyId];
  return {
    strategyId,
    strategyName,
    rows,
    metrics: calculateMetrics(strategyName, rows, totalInitialCash),
  };
};

const runPortfolioBacktest = (
  fundDataSets: FundDataSet[],
  config: StrategyConfig,
  selectedStrategyIds: StrategyId[],
  focusedStrategyId: StrategyId,
): PortfolioBacktest => {
  const strategies = selectedStrategyIds.length ? selectedStrategyIds : availableStrategyIds;
  const validFunds = fundDataSets
    .map((item) => ({
      fundId: item.id,
      fundName: item.fundName.trim() || item.fundCode || item.id,
      rows: normalizeRowsForBacktest(item.rows),
    }))
    .filter((item) => item.rows.length > 0);

  const sleeveCash = validFunds.length ? config.initialCash / validFunds.length : config.initialCash;
  const funds: FundBacktestBundle[] = validFunds.map((fund) => ({
    ...fund,
    results: runAllStrategies(fund.rows, { ...config, initialCash: sleeveCash }, strategies),
  }));

  const results = strategies.map((strategyId) =>
    aggregateStrategyResults(
      strategyId,
      funds.map((fund) => ({
        fundName: fund.fundName,
        result: fund.results.find((result) => result.strategyId === strategyId)!,
      })),
      config.initialCash,
    ),
  );

  const featuredTradeRows = funds
    .flatMap((fund) => {
      const result = fund.results.find((item) => item.strategyId === focusedStrategyId);
      return (result?.rows ?? [])
        .filter((row) => row.action !== 'hold' && row.tradeAmount > 0)
        .map((row) => ({ ...row, fundName: fund.fundName }));
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.fundName ?? '').localeCompare(b.fundName ?? ''));

  return { funds, results, featuredTradeRows };
};

export default function App() {
  const [screenshots, setScreenshots] = useState<ScreenshotImport[]>([]);
  const [codeFunds, setCodeFunds] = useState<FundDataSet[]>([]);
  const [activeScreenshotId, setActiveScreenshotId] = useState<string>();
  const [activeFundId, setActiveFundId] = useState<string>();
  const [portfolio, setPortfolio] = useState<PortfolioBacktest>();
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<StrategyId[]>(availableStrategyIds);
  const [focusedStrategyId, setFocusedStrategyId] = useState<StrategyId>(defaultFocusedStrategyId);
  const [progress, setProgress] = useState<OcrProgress>(idleProgress);
  const [error, setError] = useState('');
  const [isRecognizing, setIsRecognizing] = useState(false);

  const activeScreenshot = useMemo(
    () => screenshots.find((item) => item.id === activeScreenshotId) ?? screenshots[0],
    [activeScreenshotId, screenshots],
  );
  const screenshotFunds = useMemo<FundDataSet[]>(
    () =>
      screenshots.map((item) => ({
        id: item.id,
        fundName: item.fundName.trim() || item.name,
        source: 'screenshot',
        rows: item.parsedRows,
        ocrText: item.ocrText,
      })),
    [screenshots],
  );
  const allFunds = useMemo(() => [...codeFunds, ...screenshotFunds], [codeFunds, screenshotFunds]);
  const activeFund = useMemo(
    () => allFunds.find((item) => item.id === activeFundId) ?? allFunds[0],
    [activeFundId, allFunds],
  );
  const results = portfolio?.results ?? [];
  const hasBacktestRows = allFunds.some((item) => item.rows.length);
  const activeFocusedStrategyId = selectedStrategyIds.includes(focusedStrategyId)
    ? focusedStrategyId
    : selectedStrategyIds[0] ?? defaultFocusedStrategyId;
  const featuredResult = useMemo(
    () => results.find((result) => result.strategyId === activeFocusedStrategyId),
    [activeFocusedStrategyId, results],
  );
  const bestReturnResult = useMemo(
    () =>
      results.reduce<BacktestResult | undefined>(
        (best, result) => (!best || result.metrics.totalReturn > best.metrics.totalReturn ? result : best),
        undefined,
      ),
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
    setActiveFundId(nextScreenshots[0]?.id);
    setPortfolio(undefined);
    setError('');
    setProgress(idleProgress);
  };

  const resetUpload = () => {
    screenshots.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setScreenshots([]);
    setActiveScreenshotId(undefined);
    setActiveFundId(undefined);
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
        setActiveFundId(screenshot.id);
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
        label: `已识别 ${screenshots.length} 只基金，请逐只核对后开始策略回测`,
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
    if (!activeFund || activeFund.source !== 'screenshot') return;
    const screenshot = screenshots.find((item) => item.id === activeFund.id);
    if (!screenshot) return;
    const rows = parseOcrText(screenshot.ocrText);
    updateScreenshot(screenshot.id, { parsedRows: rows, status: rows.length ? 'done' : 'error' });
    setProgress({
      stage: 'parse',
      label: `${screenshot.fundName} 已重新解析 ${rows.length} 条净值记录`,
      progress: 1,
    });
    if (!rows.length) setError('未解析到净值行，请检查日期、净值和日涨幅是否在同一行附近。');
    else setError('');
  };

  const confirmAndBacktest = () => {
    const nextPortfolio = runPortfolioBacktest(allFunds, config, selectedStrategyIds, activeFocusedStrategyId);
    setPortfolio(nextPortfolio);
    if (!nextPortfolio.funds.length) {
      setError('还没有任何基金拥有可回测的净值数据，请先完成 OCR 并核对表格。');
    } else {
      setError('');
    }
  };

  const rerunBacktest = () => {
    if (!hasBacktestRows) return;
    setPortfolio(runPortfolioBacktest(allFunds, config, selectedStrategyIds, activeFocusedStrategyId));
  };

  const toggleStrategy = (strategyId: StrategyId) => {
    if (selectedStrategyIds.includes(strategyId)) {
      if (selectedStrategyIds.length === 1) return;
      const next = selectedStrategyIds.filter((item) => item !== strategyId);
      setSelectedStrategyIds(next);
      if (focusedStrategyId === strategyId) setFocusedStrategyId(next[0]);
    } else {
      setSelectedStrategyIds(
        availableStrategyIds.filter((item) => selectedStrategyIds.includes(item) || item === strategyId),
      );
    }
    setPortfolio(undefined);
  };
  const selectAllStrategies = () => {
    setSelectedStrategyIds(availableStrategyIds);
    setPortfolio(undefined);
  };

  const selectAdaptiveStrategies = () => {
    setSelectedStrategyIds(['adaptive_profit_strategy', 'adaptive_defensive_strategy']);
    setFocusedStrategyId('adaptive_profit_strategy');
    setPortfolio(undefined);
  };

  const activeRows = activeFund?.rows ?? [];
  const activeOcrText = activeFund?.source === 'screenshot' ? activeFund.ocrText ?? '' : '';
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="app-header">
          <div>
            <h1>A股科技基金截图回测模拟器</h1>
            <p>输入基金代码或上传截图，获取历史日涨跌幅，比较不同策略在该基金上的模拟收益。</p>
          </div>
          {results.length > 0 && (
            <div className="header-stat">
              <span>当前收益最高：{bestReturnResult?.strategyName}</span>
              <strong>{formatMoney(bestReturnResult?.metrics.finalAsset ?? 0)}</strong>
              <small>{formatPercent(bestReturnResult?.metrics.totalReturn)}</small>
            </div>
          )}
        </header>

        <section className="section">
          <div className="section-header">
            <div>
              <h2>回测口径</h2>
              <p>单只基金会直接回测该基金；多只基金会按资金槽汇总为组合。</p>
            </div>
          </div>
          <div className="grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-2">
            <p>
              每只基金按照自己的净值涨跌独立触发加仓/减仓信号；如果只输入一只基金，结果就是该基金的策略模拟收益。
            </p>
            <p>
              场外基金一般按交易日收盘净值确认；本模拟器默认用当天净值成交，实盘会受到确认延迟、费率和净值更新滞后的影响。
            </p>
          </div>
        </section>

        <FundCodeImporter
          funds={codeFunds}
          onImported={(funds) => {
            setCodeFunds(funds);
            setActiveFundId(funds[0]?.id ?? screenshots[0]?.id);
            setActiveScreenshotId(undefined);
            setPortfolio(undefined);
          }}
          onSelectFund={(id) => {
            setActiveFundId(id);
            setActiveScreenshotId(undefined);
          }}
        />

        <ImageUploader
          screenshots={screenshots}
          activeScreenshotId={activeScreenshotId}
          progress={progress}
          error={error}
          isRecognizing={isRecognizing}
          onFilesChange={handleFilesChange}
          onSelectScreenshot={(id) => {
            setActiveScreenshotId(id);
            setActiveFundId(id);
          }}
          onRenameScreenshot={(id, fundName) => updateScreenshot(id, { fundName })}
          onStart={startOcr}
          onReset={resetUpload}
        />

        {activeFund && (
          <section className="section">
            <div className="section-header">
              <div>
                <h2>当前核对基金</h2>
                <p>
                  {activeFund.fundName}
                  {activeFund.fundCode ? `（${activeFund.fundCode}）` : ''}。当前表格只属于这只基金。
                </p>
              </div>
            </div>
          </section>
        )}

        {activeFund?.source === 'screenshot' && (
          <OcrTextPreview
            text={activeOcrText}
            onTextChange={(text) => updateScreenshot(activeFund.id, { ocrText: text })}
            onParse={parseTextAgain}
          />
        )}

        {activeFund?.source === 'fund-code' && (
          <section className="section">
            <div className="section-header">
              <div>
                <h2>基金代码数据</h2>
                <p>代码导入的数据来自公开净值脚本，无需 OCR。可在下方净值表中核对和修改。</p>
              </div>
            </div>
          </section>
        )}

        <ParsedDataEditor
          rows={activeRows}
          onRowsChange={(rows) => {
            if (!activeFund) return;
            if (activeFund.source === 'screenshot') {
              updateScreenshot(activeFund.id, { parsedRows: rows });
            } else {
              setCodeFunds((current) =>
                current.map((fund) =>
                  fund.id === activeFund.id
                    ? {
                        ...fund,
                        rows,
                        actualTradingDays: rows.length,
                        startDate: rows[0]?.date,
                        endDate: rows[rows.length - 1]?.date,
                      }
                    : fund,
                ),
              );
            }
          }}
          onConfirm={confirmAndBacktest}
          title={activeFund ? `${activeFund.fundName} 净值数据` : '确认净值数据'}
          description="当前表格只属于选中的这只基金。单只基金会直接回测；多只基金会分别回测后汇总。"
          confirmLabel="确认数据并开始策略回测"
          confirmDisabled={!hasBacktestRows}
        />

        <section className="section">
          <div className="section-header">
            <div>
              <h2>{"\u7b56\u7565\u9009\u62e9"}</h2>
              <p>{"\u52fe\u9009\u53c2\u4e0e\u56de\u6d4b\u7684\u7b56\u7565\uff0c\u5e76\u9009\u62e9\u4e00\u4e2a\u7528\u4e8e\u4ed3\u4f4d\u56fe\u3001\u4e70\u5356\u70b9\u548c\u4ea4\u6613\u65e5\u5fd7\u7684\u91cd\u70b9\u5c55\u793a\u7b56\u7565\u3002"}</p>
            </div>
            <div className="flex gap-2">
              <button className="secondary-button" type="button" onClick={selectAllStrategies}>
                {"\u5168\u90e8\u7b56\u7565"}
              </button>
              <button className="secondary-button" type="button" onClick={selectAdaptiveStrategies}>
                {"\u53ea\u770b\u4e09\u6863"}
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {availableStrategyIds.map((strategyId) => {
              const checked = selectedStrategyIds.includes(strategyId);
              return (
                <div key={strategyId} className="rounded-md border border-slate-200 bg-white p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && selectedStrategyIds.length === 1}
                      onChange={() => toggleStrategy(strategyId)}
                    />
                    {STRATEGY_NAMES[strategyId]}
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="radio"
                      name="focusedStrategy"
                      checked={activeFocusedStrategyId === strategyId}
                      disabled={!checked}
                      onChange={() => { setFocusedStrategyId(strategyId); setPortfolio(undefined); }}
                    />
                    {"\u91cd\u70b9\u5c55\u793a"}
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <StrategyConfigPanel config={config} onChange={setConfig} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="primary-button" disabled={!hasBacktestRows} onClick={rerunBacktest}>
            使用当前参数重新回测
          </button>
          <button
            className="secondary-button"
            disabled={!results.length}
            onClick={() => downloadCsv('backtest-records.csv', buildAllRecordsCsv(results))}
          >
            导出每日记录 CSV
          </button>
          <button
            className="secondary-button"
            disabled={!featuredResult?.rows.length}
            onClick={() =>
              downloadCsv('focused-strategy-records.csv', backtestRowsToCsv(featuredResult?.rows ?? []))
            }
          >
            {"\u5bfc\u51fa\u91cd\u70b9\u7b56\u7565\u6bcf\u65e5\u8bb0\u5f55 CSV"}
          </button>
        </div>

        <MetricsTable results={results} />

        {results.length > 0 && (
          <div className="grid gap-6 xl:grid-cols-2">
            <AssetChart results={results} />
            <DrawdownChart results={results} />
            {featuredResult && <PositionChart rows={featuredResult.rows} strategyName={featuredResult.strategyName} />}
            {featuredResult && <TradeSignalChart rows={featuredResult.rows} strategyName={featuredResult.strategyName} />}
          </div>
        )}

        {portfolio && <TradeLogTable rows={portfolio.featuredTradeRows} strategyName={STRATEGY_NAMES[activeFocusedStrategyId]} />}

        <section className="section">
          <div className="section-header">
            <div>
              <h2>参数优化</h2>
              <p>后续可以按单只基金或多基金汇总结果搜索参数，目标可选总收益、夏普和收益回撤比。</p>
            </div>
          </div>
          <div className="notice">
            当前版本先输出策略回测、资产曲线和交易日志。下一步可以把参数优化接到新三档策略上，按历史数据自动搜索更适合该基金的参数。
          </div>
        </section>
      </div>
    </main>
  );
}
