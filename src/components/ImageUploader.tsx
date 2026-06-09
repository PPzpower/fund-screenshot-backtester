import type { OcrProgress, ScreenshotImport } from '../types';

type Props = {
  screenshots: ScreenshotImport[];
  activeScreenshotId?: string;
  progress: OcrProgress;
  error?: string;
  isRecognizing: boolean;
  onFilesChange: (files: File[]) => void;
  onSelectScreenshot: (id: string) => void;
  onStart: () => void;
  onReset: () => void;
};

export const ImageUploader = ({
  screenshots,
  activeScreenshotId,
  progress,
  error,
  isRecognizing,
  onFilesChange,
  onSelectScreenshot,
  onStart,
  onReset,
}: Props) => {
  const activeScreenshot = screenshots.find((item) => item.id === activeScreenshotId) ?? screenshots[0];

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>上传截图</h2>
          <p>支持一次选择多张截图，截图只在浏览器本地识别，不会上传到服务器。</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <label className="upload-zone">
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) onFilesChange(files);
              event.currentTarget.value = '';
            }}
          />
          <span className="text-base font-semibold text-slate-800">选择一张或多张基金 App 净值截图</span>
          <span className="mt-2 text-sm text-slate-500">
            支持 PNG、JPG、WebP。多张图会逐张 OCR，并合并到下方可编辑表格。
          </span>
        </label>

        <div className="preview-box">
          {activeScreenshot ? (
            <img src={activeScreenshot.previewUrl} alt={activeScreenshot.name} className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-slate-400">暂无图片预览</span>
          )}
        </div>
      </div>

      {screenshots.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
            <span>已选择 {screenshots.length} 张截图</span>
            <span>{screenshots.filter((item) => item.status === 'done').length} 张已识别</span>
          </div>
          <div className="screenshot-grid">
            {screenshots.map((item, index) => (
              <button
                key={item.id}
                className={`screenshot-thumb ${item.id === activeScreenshot?.id ? 'active' : ''}`}
                onClick={() => onSelectScreenshot(item.id)}
                type="button"
              >
                <img src={item.previewUrl} alt={item.name} />
                <span className="name">{index + 1}. {item.name}</span>
                <span className={`import-status ${item.status}`}>
                  {item.status === 'pending' && '待识别'}
                  {item.status === 'recognizing' && '识别中'}
                  {item.status === 'done' && `${item.parsedRows.length} 条`}
                  {item.status === 'error' && '失败'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button className="primary-button" disabled={!screenshots.length || isRecognizing} onClick={onStart}>
          {isRecognizing ? '识别中...' : screenshots.length > 1 ? '开始批量识别' : '开始识别'}
        </button>
        <button className="secondary-button" disabled={isRecognizing && !screenshots.length} onClick={onReset}>
          重新上传
        </button>
      </div>

      {(isRecognizing || progress.stage !== 'idle') && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
            <span>{progress.label}</span>
            <span>{Math.round(progress.progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-slate-900 transition-all"
              style={{ width: `${Math.round(progress.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {error && <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    </section>
  );
};
