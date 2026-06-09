type Props = {
  text: string;
  onTextChange: (value: string) => void;
  onParse: () => void;
};

export const OcrTextPreview = ({ text, onTextChange, onParse }: Props) => {
  const copyText = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
  };

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>OCR 文本预览</h2>
          <p>多张截图的 OCR 文本会合并显示，可手动修正后重新解析。</p>
        </div>
        <div className="flex gap-2">
          <button className="secondary-button" onClick={copyText} disabled={!text}>
            复制文本
          </button>
          <button className="primary-button" onClick={onParse} disabled={!text.trim()}>
            重新解析
          </button>
        </div>
      </div>
      <textarea
        className="field min-h-48 font-mono text-sm"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder="识别后的原始 OCR 文本会显示在这里"
      />
    </section>
  );
};
