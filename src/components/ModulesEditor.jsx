import React, { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../utils/lomsApi'
import { useToast } from './Toast'

const STARTER_CODE = `# Пользовательский модуль LOMS
# ─────────────────────────────────────────
# Доступно:
#   • numpy, scipy.optimize (linprog, milp, ...)
#   • переменная "context" — данные от UI:
#       context["graph"]         — текущая модель из канваса
#       context["last_result"]   — последний результат решателя
#       context["models"]        — список сохранённых моделей
#   • переменная "result"  — что положите, то и придёт в UI
#
# Пример: посчитать оптимальное решение текущей модели вручную
# ─────────────────────────────────────────

import sys
sys.path.insert(0, "${LOMS_BACKEND_DIR}")

from solver_engine import ModelTranslator, SolverAdapter, ResultFormatter
import time

graph = context.get("graph") or {"direction": "min", "nodes": [], "edges": []}

t = ModelTranslator(graph)
try:
    t.translate()
except Exception as ex:
    print("Ошибка перевода:", ex)
    result = {"error": str(ex)}
else:
    print(f"Переменных: {len(t.variables)}, ограничений: {len(t.constraints)}")
    print(f"MILP: {t.is_milp()}")
    print(t.lp_text())

    adapter = SolverAdapter({"time_limit": 30, "gap_tolerance": 0.001})
    fmt = ResultFormatter(t)
    t0 = time.perf_counter()
    raw = adapter.solve_milp(t.to_scipy_milp()) if t.is_milp() else adapter.solve_lp(t.to_scipy_lp())
    res = fmt.format(raw, time.perf_counter() - t0)
    result = res
    print()
    print("Status:", res["status"], "| z =", res["objective_value"])
`

export default function ModulesEditor({ currentGraph, lastResult }) {
  const [list, setList]               = useState([])
  const [activeId, setActiveId]       = useState(null)
  const [name, setName]               = useState('')
  const [description, setDescription] = useState('')
  const [code, setCode]               = useState('')
  const [dirty, setDirty]             = useState(false)
  const [loading, setLoading]         = useState(false)
  const [running, setRunning]         = useState(false)
  const [output, setOutput]           = useState(null)   // {stdout,stderr,result,error,elapsed,status}
  const codeRef = useRef(null)
  const toast = useToast()

  // Загрузка списка
  const refresh = useCallback(async () => {
    setLoading(true)
    const r = await api.moduleList()
    setLoading(false)
    if (r.status === 'OK') setList(r.modules || [])
    else toast.error(r.error || 'Ошибка загрузки модулей')
  }, [toast])

  useEffect(() => { refresh() }, [refresh])

  // Загрузка одного модуля
  const openModule = useCallback(async (id) => {
    if (dirty && !window.confirm('Несохранённые изменения будут потеряны. Продолжить?')) return
    const r = await api.moduleGet(id)
    if (r.status !== 'OK') { toast.error(r.error); return }
    setActiveId(id)
    setName(r.module.name || '')
    setDescription(r.module.description || '')
    setCode(r.module.code || '')
    setDirty(false)
    setOutput(null)
  }, [dirty, toast])

  // Новый модуль
  const newModule = useCallback(() => {
    if (dirty && !window.confirm('Несохранённые изменения будут потеряны. Продолжить?')) return
    setActiveId(null)
    setName('Новый модуль')
    setDescription('')
    setCode(STARTER_CODE)
    setDirty(true)
    setOutput(null)
  }, [dirty])

  // Сохранить
  const save = useCallback(async () => {
    if (!name.trim()) { toast.warning('Укажите имя модуля'); return }
    const payload = { name: name.trim(), code, description, tags: [] }
    let r
    if (activeId) {
      r = await api.moduleUpdate({ id: activeId, ...payload })
    } else {
      r = await api.moduleCreate(payload)
    }
    if (r.status === 'OK' && r.module) {
      setActiveId(r.module.id)
      setDirty(false)
      toast.success(activeId ? 'Модуль обновлён' : `Модуль создан (id ${r.module.id})`)
      refresh()
    } else {
      toast.error(r.error || 'Ошибка сохранения')
    }
  }, [activeId, name, code, description, refresh, toast])

  // Удалить 
  const remove = useCallback(async (id, modName, e) => {
    e?.stopPropagation()
    if (!window.confirm(`Удалить модуль «${modName}»?`)) return
    const r = await api.moduleDelete(id)
    if (r.status === 'OK') {
      toast.success('Модуль удалён')
      if (activeId === id) {
        setActiveId(null); setName(''); setDescription(''); setCode(''); setDirty(false); setOutput(null)
      }
      refresh()
    } else {
      toast.error(r.error || 'Ошибка удаления')
    }
  }, [activeId, refresh, toast])

  // Запуск
  const run = useCallback(async () => {
    if (!code.trim()) { toast.warning('Код пустой'); return }

    // Если модуль не сохранён — сохраняем перед запуском (best-effort)
    let runId = activeId
    if (!runId) {
      // Запустим без сохранения, передав код напрямую.
    }

    setRunning(true)
    setOutput(null)
    const ctx = {
      graph: currentGraph || null,
      last_result: lastResult || null,
    }
    const r = await api.moduleRun({
      id: runId || undefined,
      code: runId ? undefined : code,    // Если есть id, БД-версия, иначе текущий код
      context: ctx,
      timeout: 30,
    })
    setRunning(false)

    setOutput({
      status:  r.status,
      stdout:  r.stdout || '',
      stderr:  r.stderr || '',
      result:  r.result,
      error:   r.error,
      elapsed: r.elapsed,
    })

    if (r.status === 'OK') {
      toast.success(`Выполнено за ${r.elapsed} сек`)
    } else if (r.status === 'Timeout') {
      toast.warning('Превышен лимит времени выполнения')
    } else {
      toast.error('Ошибка выполнения — см. вывод')
    }
  }, [code, activeId, currentGraph, lastResult, toast])

  // Tab в textarea — подменяем на 4 пробела
  const onCodeKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target
      const s = ta.selectionStart, en = ta.selectionEnd
      const val = ta.value
      const newVal = val.slice(0, s) + '    ' + val.slice(en)
      setCode(newVal)
      // курсор после вставки
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = s + 4
      })
      setDirty(true)
    }
  }

  // Render
  const noActive = !activeId && !dirty

  return (
    <div className="modules-page">
      {/* Левая колонка — список модулей */}
      <div className="modules-list">
        <div className="modules-list-header">
          <span>Мои модули {list.length > 0 && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({list.length})</span>}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="icon-btn" onClick={refresh} title="Обновить">⟳</button>
            <button className="icon-btn" onClick={newModule} title="Создать модуль">＋</button>
          </div>
        </div>
        <div className="modules-list-scroll">
          {loading && (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20, fontSize: 12 }}>
              Загрузка…
            </div>
          )}
          {!loading && list.length === 0 && (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20, fontSize: 12 }}>
              Модулей пока нет.<br/>
              <button className="btn"
                      style={{ marginTop: 12, fontSize: 12 }}
                      onClick={newModule}>＋ Создать первый</button>
            </div>
          )}
          {list.map(m => (
            <div key={m.id}
                 className={`module-card ${activeId === m.id ? 'active' : ''}`}
                 onClick={() => openModule(m.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <div className="module-card-name">{m.name}</div>
                <button className="saved-del"
                        onClick={(e) => remove(m.id, m.name, e)}
                        title="Удалить">×</button>
              </div>
              {m.description && (
                <div className="module-card-desc">{m.description}</div>
              )}
              <div className="module-card-time">
                {m.last_run_at
                  ? `Запущен: ${new Date(m.last_run_at).toLocaleString()}`
                  : `Изменён: ${new Date(m.updated_at).toLocaleString()}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Правая колонка — редактор */}
      {noActive ? (
        <div className="modules-empty">
          <div style={{ fontSize: 48, marginBottom: 16 }}>🐍</div>
          <h2>Python-редактор модулей</h2>
          <p>
            Здесь можно писать собственные скрипты, обращаться к движку решателя,
            анализировать решения и сохранять модули в базу данных.
          </p>
          <button className="btn btn-primary" onClick={newModule}>
            ＋ Создать модуль
          </button>
        </div>
      ) : (
        <div className="modules-editor">
          <div className="modules-editor-bar">
            <input className="module-name-input"
                   value={name}
                   placeholder="Название модуля"
                   onChange={(e) => { setName(e.target.value); setDirty(true) }}/>
            {dirty && <span style={{ color: '#d97706', fontSize: 11, fontWeight: 600 }}>● несохр.</span>}
            <button className="btn" onClick={save} disabled={!dirty && !!activeId}>
              💾 Сохранить
            </button>
            <button className="btn btn-success" onClick={run} disabled={running}>
              {running ? '⏳ Выполняется…' : '▶ Запустить'}
            </button>
          </div>

          <div className="module-desc-area">
            <textarea value={description}
                      placeholder="Описание модуля (необязательно)…"
                      onChange={(e) => { setDescription(e.target.value); setDirty(true) }}/>
          </div>

          <div className="code-editor-wrap">
            <textarea ref={codeRef}
                      className="code-editor"
                      value={code}
                      spellCheck={false}
                      placeholder="# Пишите Python-код здесь…"
                      onChange={(e) => { setCode(e.target.value); setDirty(true) }}
                      onKeyDown={onCodeKeyDown}/>
          </div>

          {output && (
            <div className="module-output">
              <div className="module-output-header">
                <span>
                  Вывод · {' '}
                  <span style={{
                    color: output.status === 'OK' ? '#a3e635'
                         : output.status === 'Timeout' ? '#fcd34d'
                         : '#fca5a5',
                  }}>
                    {output.status}
                  </span>
                  {output.elapsed != null && <span> · {output.elapsed} сек</span>}
                </span>
                <button className="icon-btn"
                        style={{ color: '#64748b' }}
                        onClick={() => setOutput(null)}>×</button>
              </div>
              {output.stdout && (
                <div className="module-output-stdout">{output.stdout}</div>
              )}
              {output.stderr && (
                <div className="module-output-stderr">{output.stderr}</div>
              )}
              {output.error && (
                <div className="module-output-stderr">{output.error}</div>
              )}
              {output.result !== undefined && output.result !== null && (
                <div className="module-output-result">
                  <div style={{ color: '#64748b', marginBottom: 4 }}>result:</div>
                  {typeof output.result === 'string'
                    ? output.result
                    : JSON.stringify(output.result, null, 2)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}