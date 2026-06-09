import { DAILY_RETURN_WARNING_RANGE } from '../config';
import type { FundNavRow, ParsedValidation } from '../types';
import {
  asInputPercent,
  downloadCsv,
  isValidDate,
  navRowsToCsv,
  parsePercentInput,
  recalculateDailyReturns,
  sortRowsByDate,
  uid,
} from '../utils/format';

type Props = {
  rows: FundNavRow[];
  onRowsChange: (rows: FundNavRow[]) => void;
  onConfirm: () => void;
};

const validateRows = (rows: FundNavRow[]) => {
  const dateCounts = new Map<string, number>();
  rows.forEach((row) => dateCounts.set(row.date, (dateCounts.get(row.date) ?? 0) + 1));

  return rows.map((row): ParsedValidation => {
    const messages: string[] = [];
    if (!isValidDate(row.date)) messages.push('日期不合法');
    if (!Number.isFinite(row.nav) || row.nav <= 0) messages.push('净值必须为正数');
    if (dateCounts.get(row.date)! > 1) messages.push('日期重复');
    if (row.dailyReturn === undefined || !Number.isFinite(row.dailyReturn)) messages.push('日涨幅缺失');
    if (
      typeof row.dailyReturn === 'number' &&
      (row.dailyReturn < DAILY_RETURN_WARNING_RANGE.min || row.dailyReturn > DAILY_RETURN_WARNING_RANGE.max)
    ) {
      messages.push('日涨幅超出常见范围');
    }
    if (messages.length === 0) return { status: 'valid', messages: ['通过'] };
    const hasError = messages.some((message) => message !== '日涨幅超出常见范围');
    return { status: hasError ? 'error' : 'warning', messages };
  });
};

export const ParsedDataEditor = ({ rows, onRowsChange, onConfirm }: Props) => {
  const validations = validateRows(rows);
  const hasError = validations.some((item) => item.status === 'error');

  const updateRow = (id: string, patch: Partial<FundNavRow>) => {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    onRowsChange([
      ...rows,
      {
        id: uid(),
        date: new Date().toISOString().slice(0, 10),
        nav: 1,
        dailyReturn: 0,
      },
    ]);
  };

  const exportCsv = () => downloadCsv('ocr-nav-data.csv', navRowsToCsv(rows));

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2>确认净值数据</h2>
          <p>请逐行核对 OCR 结果，确认无误后开始回测。</p>
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <button className="secondary-button" onClick={addRow}>
          新增行
        </button>
        <button className="secondary-button" onClick={() => onRowsChange(sortRowsByDate(rows))}>
          日期升序
        </button>
        <button className="secondary-button" onClick={() => onRowsChange(recalculateDailyReturns(rows))}>
          按净值重算涨幅
        </button>
        <button className="secondary-button" onClick={exportCsv} disabled={!rows.length}>
          导出净值 CSV
        </button>
        <button className="primary-button" onClick={onConfirm} disabled={!rows.length || hasError}>
          确认数据并开始回测
        </button>
      </div>

      {rows.length > 0 && rows.length < 20 && (
        <div className="notice warning">数据少于 20 条，回测参考价值较低。</div>
      )}
      {rows.length >= 20 && rows.length < 60 && (
        <div className="notice">数据少于 60 条，MA60 可能无法准确计算。</div>
      )}

      <div className="table-wrap mt-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>净值</th>
              <th>日涨幅</th>
              <th>校验状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const validation = validations[index];
              return (
                <tr key={row.id} className={validation.status === 'error' ? 'row-error' : ''}>
                  <td>
                    <input
                      className="table-input"
                      type="date"
                      value={row.date}
                      onChange={(event) => updateRow(row.id, { date: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="number"
                      step="0.0001"
                      value={Number.isFinite(row.nav) ? row.nav : ''}
                      onChange={(event) => updateRow(row.id, { nav: Number(event.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      className="table-input"
                      type="text"
                      value={asInputPercent(row.dailyReturn)}
                      onChange={(event) =>
                        updateRow(row.id, { dailyReturn: parsePercentInput(event.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <span className={`status-pill ${validation.status}`}>{validation.messages.join('，')}</span>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onRowsChange(rows.filter((item) => item.id !== row.id))}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  上传并识别截图后，净值数据会显示在这里。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
