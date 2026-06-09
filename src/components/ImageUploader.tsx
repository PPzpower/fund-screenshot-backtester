import type { OcrProgress } from '../types';

type Props = {
  imageUrl?: string;
  progress: OcrProgress;
  error?: string;
  isRecognizing: boolean;
  onFileChange: (file: File) => void;
  onStart: () => void;
  onReset: () => void;
};

export const ImageUploader = ({
  imageUrl,
  progress,
  error,
  isRecognizing,
  onFileChange,
  onStart,
  onReset,
}: Props) => {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>上传截图</h2>
          <p>截图只在浏览器本地识别，不会上传到服务器。</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <label className="upload-zone">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileChange(file);
              event.currentTarget.value = '';
            }}
          />
          <span className="text-base font-semibold text-slate-800">选择基金 App 净值截图</span>
          <span className="mt-2 text-sm text-slate-500">支持 PNG、JPG、WebP。建议截取包含日期、净值、日涨幅的表格区域。</span>
        </label>

        <div className="preview-box">
          {imageUrl ? (
            <img src={imageUrl} alt="截图预览" className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm text-slate-400">暂无图片预览</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button className="primary-button" disabled={!imageUrl || isRecognizing} onClick={onStart}>
          {isRecognizing ? '识别中...' : '开始识别'}
        </button>
        <button className="secondary-button" disabled={isRecognizing && !imageUrl} onClick={onReset}>
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
