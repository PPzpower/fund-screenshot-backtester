import { createWorker } from 'tesseract.js';
import { preprocessImage } from './imagePreprocess';
import type { OcrProgress } from '../types';

export type RecognizeOptions = {
  binary?: boolean;
};

/**
 * 浏览器本地 OCR。图片只会传给本页中的 Tesseract worker，不会上传服务器。
 */
export const recognizeScreenshot = async (
  file: File,
  onProgress: (progress: OcrProgress) => void,
  options: RecognizeOptions = {},
) => {
  try {
    onProgress({ stage: 'preprocess', label: '正在预处理图片', progress: 0.08 });
    const preprocessed = await preprocessImage(file, { binary: options.binary });

    onProgress({ stage: 'recognize', label: '正在加载本地 OCR 引擎', progress: 0.15 });
    const worker = await createWorker('chi_sim+eng', 1, {
      logger: (message) => {
        if (message.status) {
          const normalizedProgress = Math.min(0.95, 0.18 + (message.progress ?? 0) * 0.72);
          onProgress({
            stage: 'recognize',
            label: message.status.includes('recognizing') ? '正在识别文字' : `OCR：${message.status}`,
            progress: normalizedProgress,
          });
        }
      },
    });

    await worker.setParameters({
      preserve_interword_spaces: '1',
      tessedit_char_whitelist:
        '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ年月日日期净值涨幅+-−－.%/ ',
    });

    const result = await worker.recognize(preprocessed.blob);
    await worker.terminate();

    onProgress({ stage: 'parse', label: '正在解析表格', progress: 0.98 });
    return result.data.text;
  } catch (error) {
    onProgress({
      stage: 'error',
      label: error instanceof Error ? error.message : 'OCR 识别失败',
      progress: 0,
    });
    throw error;
  }
};
