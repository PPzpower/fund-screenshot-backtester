import { useMemo, useState } from 'react';
import { DEFAULT_STRATEGY_CONFIG } from './config';
import { runAllStrategies } from './backtest/engine';
import { AssetChart } from './components/AssetChart';
import { DrawdownChart } from './components/DrawdownChart';
import { ImageUploader } from './components/ImageUploader';
import { MetricsTable } from './components/MetricsTable';
import { OcrTextPreview } from './components/OcrTextPreview';
import { OptimizerPanel } from './components/OptimizerPanel';
import { ParsedDataEditor } from './components/ParsedDataEditor';
import { PositionChart } from './components/PositionChart';
import { StrategyConfigPanel } from './components/StrategyConfigPanel';
import { TradeLogTable } from './components/TradeLogTable';
import { TradeSignalChart } from './components/TradeSignalChart';
import type { BacktestResult, FundNavRow, OcrProgress, ScreenshotImport, StrategyConfig } from './types';
import { recognizeScreenshot } from './utils/ocr';
import { parseOcrText } from './utils/parseOcrText';
import {
  backtestRowsToCsv,
  downloadCsv,
  formatMoney,
  formatPercent,
  normalizeRowsForBacktest,
  recalculateDailyReturns,
  sortRowsByDate,
  toCsv,
  uid,
} from './utils/format';

const idleProgress: OcrProgress = {
  stage: 'idle',
  label: '等待上传截图',
  progress: 0,
};

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

const mergeRowsByDate = (rowGroups: FundNavRow[][]) => {
  const byDate = new Map<string, FundNavRow>();

  rowGroups.flat().forEach((row) => {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, row);
      return;
    }

    const shouldReplace =
      existing.dailyReturn === undefined ||
      (row.dailyReturn !== undefined && Math.abs(row.nav - existing.nav) < 0.00001);

    if (shouldReplace) byDate.set(row.date, row);
  });

  return recalculateDailyReturns(sortRowsByDate([...byDate.values()]));
};

export default function App() {
  const [screenshots, setScreenshots] = useState<ScreenshotImport[]>([]);
  const [activeScreenshotId, setActiveScreenshotId] = useState<string>();
  const [ocrText, setOcrText] = useState('');
  const [parsedRows, setParsedRows] = useState<FundNavRow[]>([]);
  const [confirmedRows, setConfirmedRows] = useState<FundNavRow[]>([]);
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [config, setConfig] = useState<StrategyConfig>(DEFAULT_STRATEGY_CONFIG);
  const [progress, setProgress] = useState<OcrProgress>(idleProgress);
  const [error, setError] = useState('');
  const [isRecognizing, setIsRecognizing] = useState(false);

  const newRuleResult = useMemo(
    () => results.find((result) => result.strategyId === 'new_rule_strategy'),
    [results],
  );

  const handleFilesChange = (files: File[]) => {
    screenshots.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    const nextScreenshots = files.map((file): ScreenshotImport => ({
      id: uid(),
      name: file.name,
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
      ocrText: '',
      parsedRows: [],
    }));
    setScreenshots(nextScreenshots);
    setActiveScreenshotId(nextScreenshots[0]?.id);
    setOcrText('');
    setParsedRows([]);
    setConfirmedRows([]);
    setResults([]);
    setError('');
    setProgress(idleProgress);
  };

  const resetUpload = () => {
    screenshots.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setScreenshots([]);
    setActiveScreenshotId(undefined);
    setOcrText('');
    setParsedRows([]);
    setConfirmedRows([]);
    setResults([]);
    setError('');
    setProgress(idleProgress);
  };

  const startOcr = async () => {
    if (!screenshots.length) return;
    setIsRecognizing(true);
    setError('');
    const recognized: ScreenshotImport[] = [];
    try {
      for (let index = 0; index < screenshots.length; index += 1) {
        const screenshot = screenshots[index];
        if (!screenshot) continue;

        setActiveScreenshotId(screenshot.id);
        setScreenshots((current) =>
          current.map((item) => (item.id === screenshot.id ? { ...item, status: 'recognizing', error: undefined } : item)),
        );

        const text = await recognizeScreenshot(screenshot.file, (nextProgress) => {
          setProgress({
            ...nextProgress,
            label: `第 ${index + 1}/${screenshots.length} 张 ${screenshot.name}：${nextProgress.label}`,
            progress: (index + nextProgress.progress) / screenshots.length,
          });
        });
        const rows = parseOcrText(text);
        const updatedScreenshot: ScreenshotImport = {
          ...screenshot,
          status: 'done',
          ocrText: text,
          parsedRows: rows,
        };
        recognized.push(updatedScreenshot);
        setScreenshots((current) =>
          current.map((item) => (item.id === screenshot.id ? updatedScreenshot : item)),
        );
      }

      const combinedText = recognized
        .map((item, index) => `===== 第 ${index + 1} 张：${item.name} =====\n${item.ocrText.trim()}`)
        .join('\n\n');
      const rows = mergeRowsByDate(recognized.map((item) => item.parsedRows));
      setOcrText(combinedText);
      setParsedRows(rows);
      setProgress({
        stage: 'done',
        label: rows.length
          ? `已识别 ${recognized.length} 张截图，合并 ${rows.length} 条净值记录`
          : '未解析到净值记录',
        progress: 1,
      });
      if (!rows.length) {
        setError('没有从这些截图中解析到净值行，请尝试截取更清晰的表格区域，或在 OCR 文本中手动修正后重新解析。');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'OCR 识别失败，请更换清晰截图后重试。';
      setScreenshots((current) =>
        current.map((item) => (item.status === 'recognizing' ? { ...item, status: 'error', error: message } : item)),
      );
      setError(caught instanceof Error ? caught.message : 'OCR 识别失败，请更换清晰截图后重试。');
    } finally {
      setIsRecognizing(false);
    }
  };

  const parseTextAgain = () => {
    const rows = parseOcrText(ocrText);
    setParsedRows(mergeRowsByDate([rows]));
    setProgress({ stage: 'parse', label: `已重新解析 ${rows.length} 条净值记录`, progress: 1 });
    if (!rows.length) setError('未解析到净值行，请检查日期、净值和日涨幅是否在同一行附近。');
    else setError('');
  };

  const confirmAndBacktest = () => {
    const normalized = normalizeRowsForBacktest(parsedRows);
    setConfirmedRows(normalized);
    setResults(runAllStrategies(normalized, config));
  };

  const rerunBacktest = () => {
    if (!confirmedRows.length) return;
    setResults(runAllStrategies(confirmedRows, config));
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="app-header">
          <div>
            <h1>A股科技基金截图回测模拟器</h1>
            <p>批量上传基金净值截图，自动识别日期、净值和日涨幅，测试加仓减仓策略。</p>
          </div>
          {results.length > 0 && (
            <div className="header-stat">
              <span>新版策略期末资产</span>
              <strong>{formatMoney(newRuleResult?.metrics.finalAsset ?? 0)}</strong>
              <small>{formatPercent(newRuleResult?.metrics.totalReturn)}</small>
            </div>
          )}
        </header>

        <section className="section">
          <div className="section-header">
            <div>
              <h2>实际交易说明</h2>
              <p>本模拟器默认用当天净值成交，是为了便于策略比较。</p>
            </div>
          </div>
          <div className="grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-2">
            <p>
              场外基金一般按交易日收盘净值确认。15:00 前申购/赎回通常按当日净值，15:00 后通常按下一交易日净值。
            </p>
            <p>
              实盘会受到确认延迟、费率、净值更新滞后、跟踪误差和交易限制影响，回测结果不构成投资建议。
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
          onStart={startOcr}
          onReset={resetUpload}
        />

        <OcrTextPreview text={ocrText} onTextChange={setOcrText} onParse={parseTextAgain} />

        <ParsedDataEditor rows={parsedRows} onRowsChange={setParsedRows} onConfirm={confirmAndBacktest} />

        <StrategyConfigPanel config={config} onChange={setConfig} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="primary-button" disabled={!confirmedRows.length} onClick={rerunBacktest}>
            使用当前参数重新回测
          </button>
          <button
            className="secondary-button"
            disabled={!results.length}
            onClick={() => downloadCsv('all-backtest-records.csv', buildAllRecordsCsv(results))}
          >
            导出全部每日记录 CSV
          </button>
          <button
            className="secondary-button"
            disabled={!newRuleResult?.rows.length}
            onClick={() => downloadCsv('new-rule-daily-records.csv', backtestRowsToCsv(newRuleResult?.rows ?? []))}
          >
            导出新版策略每日记录 CSV
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

        {newRuleResult && <TradeLogTable rows={newRuleResult.rows} />}

        <OptimizerPanel rows={confirmedRows} config={config} />
      </div>
    </main>
  );
}
