import React, { useState, useEffect } from 'react'

/**
 * Правая панель с 4 вкладками:
 *   - Свойства   (выбранный узел)
 *   - Результат  (последнего решения)
 *   - Настройки  (solver config)
 *   - История    (solve history из БД)
 */
export default function RightPanel({
  selectedNode, onUpdateNode, onUpdateNodeNum, onDeleteSelected,
  result,            // последний результат решения
  config, onConfigChange,
  solverConfigs, onConfigPickFromDb,
  onExportCsv,
  history, onLoadHistoryEntry, onRefreshHistory,
  currentModelId,
}) {
  const [tab, setTab] = useState('properties')

  // При выборе нового узла — переключаемся на «Свойства» (как в эталоне)
  useEffect(() => {
    if (selectedNode) setTab('properties')
  }, [selectedNode?.id])

  // При получении нового результата — переключаемся на «Результат»
  useEffect(() => {
    if (result) setTab('results')
  }, [result])

  return (
    <div className="panel">
      <div className="tab-bar">
        <button className={`tab ${tab === 'properties' ? 'active' : ''}`}
                onClick={() => setTab('properties')}>Свойства</button>
        <button className={`tab ${tab === 'results' ? 'active' : ''}`}
                onClick={() => setTab('results')}>Результат</button>
        <button className={`tab ${tab === 'config' ? 'active' : ''}`}
                onClick={() => setTab('config')}>Настройки</button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`}
                onClick={() => { setTab('history'); onRefreshHistory?.() }}>История</button>
      </div>

      {tab === 'properties' && (
        <PropertiesTab node={selectedNode}
                       onUpdate={onUpdateNode}
                       onUpdateNum={onUpdateNodeNum}
                       onDelete={onDeleteSelected}/>
      )}

      {tab === 'results' && (
        <ResultsTab result={result} onExport={onExportCsv}/>
      )}

      {tab === 'config' && (
        <ConfigTab config={config}
                   onChange={onConfigChange}
                   solverConfigs={solverConfigs}
                   onPickFromDb={onConfigPickFromDb}/>
      )}

      {tab === 'history' && (
        <HistoryTab history={history}
                    onLoadEntry={onLoadHistoryEntry}
                    onRefresh={onRefreshHistory}
                    currentModelId={currentModelId}/>
      )}
    </div>
  )
}

// Tab: Properties
function PropertiesTab({ node, onUpdate, onUpdateNum, onDelete }) {
  if (!node) {
    return (
      <div className="empty-panel">
        <div style={{ fontSize: 32, marginBottom: 8 }}>☝️</div>
        Выберите узел для редактирования свойств
      </div>
    )
  }

  if (node.type === 'variable') {
    return (
      <div style={{ padding: '12px 16px' }}>
        <div className="panel-header" style={{ padding: '0 0 10px' }}>Переменная решения</div>

        <div className="field">
          <label>Имя</label>
          <input value={node.name ?? ''}
                 onChange={(e) => onUpdate('name', e.target.value)}/>
        </div>

        <div className="field">
          <label>Тип</label>
          <select value={node.var_type ?? 'cont'}
                  onChange={(e) => onUpdate('var_type', e.target.value)}>
            <option value="cont">Непрерывная (ℝ)</option>
            <option value="int">Целочисленная (ℤ)</option>
            <option value="binary">Булева (0/1)</option>
          </select>
        </div>

        <div className="field">
          <label>Нижняя граница</label>
          <input type="number"
                 value={node.lb ?? ''}
                 placeholder="0"
                 onChange={(e) => onUpdateNum('lb', e.target.value)}/>
        </div>

        <div className="field">
          <label>Верхняя граница</label>
          <input type="number"
                 value={node.ub ?? ''}
                 placeholder="∞ (не задана)"
                 onChange={(e) => onUpdateNum('ub', e.target.value)}/>
        </div>

        <div className="field">
          <label>Коэффициент в цел. функции (c)</label>
          <input type="number"
                 value={node.obj_coeff ?? ''}
                 placeholder="0"
                 onChange={(e) => onUpdateNum('obj_coeff', e.target.value)}/>
        </div>

        <button className="btn btn-danger"
                style={{ width: '100%', marginTop: 4 }}
                onClick={onDelete}>Удалить узел</button>
      </div>
    )
  }

  if (node.type === 'constraint') {
    return (
      <div style={{ padding: '12px 16px' }}>
        <div className="panel-header" style={{ padding: '0 0 10px' }}>Ограничение</div>

        <div className="field">
          <label>Имя</label>
          <input value={node.name ?? ''}
                 onChange={(e) => onUpdate('name', e.target.value)}/>
        </div>

        <div className="field">
          <label>Знак</label>
          <select value={node.sense ?? 'leq'}
                  onChange={(e) => onUpdate('sense', e.target.value)}>
            <option value="leq">≤ (не более)</option>
            <option value="eq">= (равно)</option>
            <option value="geq">≥ (не менее)</option>
          </select>
        </div>

        <div className="field">
          <label>Правая часть (b)</label>
          <input type="number"
                 value={node.rhs ?? ''}
                 placeholder="0"
                 onChange={(e) => onUpdateNum('rhs', e.target.value)}/>
        </div>

        <button className="btn btn-danger"
                style={{ width: '100%', marginTop: 4 }}
                onClick={onDelete}>Удалить узел</button>
      </div>
    )
  }

  // objective
  return (
    <div style={{ padding: '12px 16px' }}>
      <div className="panel-header" style={{ padding: '0 0 10px' }}>Целевая функция</div>
      <p style={{ fontSize: 12, color: '#64748b' }}>
        Направление оптимизации задаётся на панели инструментов
        (Минимизировать / Максимизировать).
      </p>
      <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
        Коэффициенты (c) задаются в свойствах каждой переменной.
      </p>
      <button className="btn btn-danger"
              style={{ width: '100%', marginTop: 12 }}
              onClick={onDelete}>Удалить узел</button>
    </div>
  )
}

// Tab: Results
function ResultsTab({ result, onExport }) {
  if (!result) {
    return (
      <div className="empty-panel" style={{ padding: '24px 16px' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        Нажмите «Решить» для получения результата
      </div>
    )
  }

  if (result.status === 'Error') {
    return (
      <div style={{ padding: '12px 16px' }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5',
                      borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>
            Ошибка решателя
          </div>
          <div style={{ fontSize: 12, color: '#7f1d1d' }}>
            {result.error || 'Неизвестная ошибка'}
          </div>
          {result.details && (
            <div style={{ fontSize: 11, color: '#7f1d1d', marginTop: 6, opacity: .8 }}>
              {result.details}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div className="results-section">
        <div style={{ fontSize: 11, color: '#064e3b', textTransform: 'uppercase',
                      letterSpacing: '.4px', fontWeight: 600 }}>
          Значение целевой функции
        </div>
        <div className="results-obj">
          {result.objective_value !== null && result.objective_value !== undefined
            ? Number(result.objective_value).toLocaleString('ru-RU', { maximumFractionDigits: 6 })
            : '—'}
        </div>
        <div className="meta-row">
          <span>Статус: <strong>{result.status}</strong></span>
          <span>Время: <strong>{result.solve_time_sec ?? 0} сек</strong></span>
        </div>
      </div>

      {result.warning && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa',
                      borderRadius: 6, padding: 8, fontSize: 11, color: '#7c2d12',
                      marginBottom: 12 }}>
          ⚠ {result.warning}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: '.4px',
                    marginBottom: 8 }}>
        Значения переменных
      </div>
      <div>
        {result.variables && Object.entries(result.variables).map(([k, v]) => (
          <div key={k} className="var-row">
            <span className="var-name">{k}</span>
            <span className="var-val">{
              typeof v === 'number'
                ? v.toLocaleString('ru-RU', { maximumFractionDigits: 6 })
                : String(v)
            }</span>
          </div>
        ))}
      </div>

      <button className="btn"
              style={{ width: '100%', marginTop: 12 }}
              onClick={onExport}>📥 Экспорт CSV</button>
    </div>
  )
}

// Tab: Config
function ConfigTab({ config, onChange, solverConfigs, onPickFromDb }) {
  return (
    <div style={{ padding: '12px 16px' }}>
      {solverConfigs && solverConfigs.length > 0 && (
        <div className="field">
          <label>Шаблон конфигурации</label>
          <select onChange={(e) => {
                    const id = +e.target.value
                    if (id) onPickFromDb(id)
                  }}
                  defaultValue="">
            <option value="">— выберите —</option>
            {solverConfigs.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.is_default ? ' (по умолчанию)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>Решатель (бэкенд)</label>
        <select value={config.backend}
                onChange={(e) => onChange('backend', e.target.value)}>
          <option value="highs">HiGHS (scipy) — рекомендуется</option>
          <option value="cbc">CBC (при установке PuLP)</option>
        </select>
      </div>

      <div className="field">
        <label>Лимит времени (сек)</label>
        <input type="number"
               value={config.time_limit}
               min="1" max="86400"
               onChange={(e) => onChange('time_limit', +e.target.value)}/>
      </div>

      <div className="field">
        <label>Допуск оптимальности (MIP gap)</label>
        <input type="number"
               value={config.gap_tolerance}
               step="0.001" min="0" max="0.5"
               onChange={(e) => onChange('gap_tolerance', +e.target.value)}/>
      </div>

      <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.6 }}>
        Gap = 0 → точное оптимальное решение MIP<br/>
        Gap &gt; 0 → допустимое отклонение от оптимума<br/>
        Значение 0.001 = 0.1% — рекомендуется для практических задач
      </div>
    </div>
  )
}

// Tab: History
function HistoryTab({ history, onLoadEntry, onRefresh, currentModelId }) {
  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '.4px' }}>
          {currentModelId ? 'История этой модели' : 'Все запуски решателя'}
        </div>
        <button className="btn"
                style={{ padding: '2px 8px', fontSize: 11 }}
                onClick={onRefresh}>⟳</button>
      </div>

      {(!history || history.length === 0) ? (
        <div className="empty-panel">
          {currentModelId
            ? 'Эта модель ещё не решалась'
            : 'История пуста — сохраните модель и запустите решение'}
        </div>
      ) : history.map(h => {
        const stClass = {
          Optimal: 'st-optimal',
          Infeasible: 'st-error',
          Unbounded: 'st-error',
          Error: 'st-error',
          TimeLimit: 'st-solving',
          Feasible: 'st-solving',
        }[h.status] || 'st-solving'

        return (
          <div key={h.id} className="history-item" onClick={() => onLoadEntry(h.id)}>
            <div className="history-row">
              <span className={`history-status ${stClass}`}>{h.status}</span>
              <span className="history-time">
                {new Date(h.solved_at).toLocaleString()}
              </span>
            </div>
            <div className="history-row">
              <span style={{ color: '#1e40af', fontWeight: 600, fontSize: 12 }}>
                z = {h.objective_value !== null && h.objective_value !== undefined
                  ? Number(h.objective_value).toLocaleString('ru-RU', { maximumFractionDigits: 4 })
                  : '—'}
              </span>
              <span className="history-time">
                {h.solve_time_sec?.toFixed?.(3) ?? h.solve_time_sec} сек
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
