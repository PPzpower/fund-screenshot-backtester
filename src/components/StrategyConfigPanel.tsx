import type { StrategyConfig } from '../types';
import { asInputPercent, parsePercentInput } from '../utils/format';

type Props = {
  config: StrategyConfig;
  onChange: (config: StrategyConfig) => void;
};

type NumericField = {
  key: keyof StrategyConfig;
  label: string;
  type: 'money' | 'percent';
  step?: string;
};

const fields: NumericField[] = [
  { key: 'initialCash', label: '初始资金', type: 'money', step: '1000' },
  { key: 'initialPosition', label: '初始仓位', type: 'percent' },
  { key: 'minPosition', label: '最低仓位', type: 'percent' },
  { key: 'maxPosition', label: '最高仓位', type: 'percent' },
  { key: 'breakdownMaxPosition', label: '破位最高仓位', type: 'percent' },
  { key: 'uptrendMinPosition', label: '主升浪最低仓位', type: 'percent' },
  { key: 'buyFee', label: '申购费', type: 'percent' },
  { key: 'sellFee', label: '赎回费', type: 'percent' },
  { key: 'singleDayDropThreshold', label: '单日下跌加仓阈值', type: 'percent' },
  { key: 'consecutive2DropThreshold', label: '连跌 2 天阈值', type: 'percent' },
  { key: 'consecutive3DropThreshold', label: '连跌 3 天阈值', type: 'percent' },
  { key: 'crashDropThreshold', label: '单日暴跌阈值', type: 'percent' },
  { key: 'singleDayRiseThreshold', label: '单日上涨减仓阈值', type: 'percent' },
  { key: 'consecutive2RiseThreshold', label: '连涨 2 天阈值', type: 'percent' },
  { key: 'consecutive3RiseThreshold', label: '连涨 3 天阈值', type: 'percent' },
];

export const StrategyConfigPanel = ({ config, onChange }: Props) => {
  const setValue = (key: keyof StrategyConfig, value: number | boolean) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>参数设置</h2>
          <p>参数会用于历史回测策略，可根据基金风格微调后重新比较收益。</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fields.map((field) => {
          const value = config[field.key];
          if (typeof value !== 'number') return null;
          return (
            <label key={field.key} className="form-label">
              <span>{field.label}</span>
              <input
                className="field"
                type="number"
                step={field.step ?? '0.1'}
                value={field.type === 'percent' ? asInputPercent(value) : value}
                onChange={(event) => {
                  const next =
                    field.type === 'percent'
                      ? parsePercentInput(event.target.value) ?? 0
                      : Number(event.target.value);
                  setValue(field.key, next);
                }}
              />
            </label>
          );
        })}
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={config.uptrendSellHalf}
          onChange={(event) => setValue('uptrendSellHalf', event.target.checked)}
        />
        主升浪模式减仓减半
      </label>
    </section>
  );
};
