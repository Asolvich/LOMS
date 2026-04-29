import React from 'react'

export default function Toolbar({
  direction, onDirectionChange,
  onValidate, onSolve, onShowLp, onClear,
  status, statusClass, busy,
}) {
  return (
    <div className="toolbar">
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Направление:</span>
      <select value={direction}
              onChange={(e) => onDirectionChange(e.target.value)}
              style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }}>
        <option value="min">Минимизировать</option>
        <option value="max">Максимизировать</option>
      </select>

      <div className="sep"></div>
      <button className="btn" onClick={onValidate} disabled={busy}>✓ Проверить</button>
      <button className="btn btn-success" onClick={onSolve} disabled={busy}>
        {busy ? '⏳ Решаем…' : '▶ Решить'}
      </button>
      <button className="btn" onClick={onShowLp} disabled={busy}>📄 LP-текст</button>

      <div className="sep"></div>
      <button className="btn btn-danger" onClick={onClear} disabled={busy}>✕ Очистить</button>

      <div className="sep"></div>
      {status && (
        <span className={`solve-status ${statusClass || ''}`}>{status}</span>
      )}
    </div>
  )
}
