export type PreprocessOptions = {
  scale?: number;
  contrast?: number;
  binary?: boolean;
  threshold?: number;
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败，请确认截图文件没有损坏。'));
    };
    image.src = url;
  });

export type PreprocessedImage = {
  blob: Blob;
  dataUrl: string;
};

/**
 * 用 canvas 做本地图片预处理。流程包含放大、灰度、对比度增强和可选二值化。
 */
export const preprocessImage = async (
  file: File,
  options: PreprocessOptions = {},
): Promise<PreprocessedImage> => {
  const scale = options.scale ?? 2;
  const contrast = options.contrast ?? 1.35;
  const threshold = options.threshold ?? 170;
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(image.width * scale));
  canvas.height = Math.max(1, Math.floor(image.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('当前浏览器不支持 canvas 图片预处理。');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    let enhanced = (gray - 128) * contrast + 128;
    enhanced = Math.max(0, Math.min(255, enhanced));
    if (options.binary) enhanced = enhanced >= threshold ? 255 : 0;
    data[index] = enhanced;
    data[index + 1] = enhanced;
    data[index + 2] = enhanced;
  }

  context.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('图片预处理输出失败。'));
    }, 'image/png');
  });

  return { blob, dataUrl: canvas.toDataURL('image/png') };
};
