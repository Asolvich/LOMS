import React, { useState, useEffect, useCallback, useRef } from 'react'

import Sidebar    from './components/Sidebar'
import Toolbar    from './components/Toolbar'
import Canvas     from './components/Canvas'
import RightPanel from './components/RightPanel'
import ModulesEditor from './components/ModulesEditor'
import { LpTextModal, SaveModelModal, VersionsModal } from './components/Modals'
import { ToastProvider, useToast } from './components/Toast'

import { TEMPLATES } from './utils/templates'
import { api, loms } from './utils/lomsApi'
import { buildLpTextLocal } from './utils/lpText'

// Утилиты
function deepCopy(o) { return JSON.parse(JSON.stringify(o)) }

// Глобальный счётчик для уникальных id новых узлов/рёбер
function nextId(prefix, existingIds) {
  let i = 1
  while (existingIds.has(prefix + i)) i++
  return prefix + i
}

// Главный компонент
function AppInner() {
  // Навигация
  const [view, setView] = useState('graph') // "graph" | "modules"

  // Состояние графа
  const [nodes,     setNodes]     = useState([])
  const [edges,     setEdges]     = useState([])
  const [direction, setDirection] = useState('min')
  const [selectedId, setSelectedId] = useState(null)

  // Конфигурация решателя
  const [config, setConfig] = useState({ backend: 'highs', time_limit: 300, gap_tolerance: 0.001 })

  // Результаты, статус, занятость
  const [result, setResult]       = useState(null)
  const [status, setStatus]       = useState('')   // текст бэйджа
  const [statusClass, setStatusClass] = useState('')
  const [busy, setBusy]           = useState(false)

  // База данных
  const [savedModels,    setSavedModels]    = useState([])
  const [solverConfigs,  setSolverConfigs]  = useState([])
  const [history,        setHistory]        = useState([])
  const [currentModelId, setCurrentModelId] = useState(null)
  const [currentModelName, setCurrentModelName] = useState('')
  const [currentModelDesc, setCurrentModelDesc] = useState('')

  // Модалки
  const [lpModal,     setLpModal]     = useState({ open: false, text: '' })
  const [saveModal,   setSaveModal]   = useState(false)
  const [versionsModal, setVersionsModal] = useState({ open: false, versions: [] })

  // Версия приложения (для бейджа)
  const [appVersion, setAppVersion] = useState('—')

  // Счётчики позиций для новых узлов (как _cx, _cy в эталоне)
  const cursorRef = useRef({ x: 100, y: 100 })

  const toast = useToast()

  // Инициализация
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Версия Electron
      try {
        const v = await loms.getVersion()
        if (!cancelled) setAppVersion(v)
      } catch (_) { /* noop */ }

      // Ping сервера
      const pong = await api.ping()
      if (cancelled) return
      if (pong.status !== 'OK') {
        toast.error(pong.error || 'Python-сервер не отвечает')
        return
      }

      // Подгружаем дефолтную конфигурацию решателя
      const cfgRes = await api.configDefault()
      if (cancelled) return
      if (cfgRes.status === 'OK' && cfgRes.config) {
        setConfig({
          backend:       cfgRes.config.backend || 'highs',
          time_limit:    cfgRes.config.time_limit ?? 300,
          gap_tolerance: cfgRes.config.gap_tolerance ?? 0.001,
        })
      }

      await refreshSolverConfigs()
      await refreshSavedModels()
      await refreshHistory()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Загрузка списков из БД
  const refreshSavedModels = useCallback(async () => {
    const r = await api.modelList()
    if (r.status === 'OK') setSavedModels(r.models || [])
  }, [])

  // Загрузка конфигов
  const refreshSolverConfigs = useCallback(async () => {
    const r = await api.configList()
    if (r.status === 'OK') setSolverConfigs(r.configs || [])
  }, [])

  // История глобальная или конкретно для текущей модели
  const refreshHistory = useCallback(async () => {
    const r = await api.resultList(currentModelId || undefined)
    if (r.status === 'OK') setHistory(r.results || [])
  }, [currentModelId])

  const refreshHistoryForCurrent = useCallback(async () =>{
    if (currentModelId){
      const r = await api.resultList(currentModelId)
      if (r.status === "OK") setHistory(r.results || [])
    } else{
      await refreshHistory()
    }
  }, [currentModelId, refreshHistory])

  // Управление узлами
  const addNode = useCallback((type) => {
    if (type === 'objective' && nodes.some(n => n.type === 'objective')) {
      toast.warning('Целевая функция уже добавлена. Допускается только один узел целевой функции.')
      return
    }

    const ids = new Set(nodes.map(n => n.id))
    const id = nextId(type[0], ids)

    // Подсчёт счётчика для имени по типу
    const sameTypeCount = nodes.filter(n => n.type === type).length + 1
    const defaults = {
      variable:   { name: 'x' + sameTypeCount, var_type: 'cont', lb: 0, ub: null, obj_coeff: 1 },
      constraint: { name: 'c' + sameTypeCount, sense: 'leq', rhs: 0 },
      objective:  { name: 'Цель' },
    }

    const c = cursorRef.current
    const newNode = { id, type, x: c.x, y: c.y, ...defaults[type] }
    cursorRef.current = {
      x: ((c.x + 180) % 600) + 60,
      y: ((c.y + (Math.random() > 0.5 ? 80 : 30)) % 450) + 40,
    }

    setNodes(arr => [...arr, newNode])
    setSelectedId(id)
  }, [nodes, toast])

  const onNodeMove = useCallback((id, x, y) => {
    setNodes(arr => arr.map(n => n.id === id ? { ...n, x, y } : n))
  }, [])

  const onSelect = useCallback((id) => {
    setSelectedId(id)
  }, [])

  const updateNodeProp = useCallback((key, val) => {
    if (!selectedId) return
    setNodes(arr => arr.map(n => n.id === selectedId ? { ...n, [key]: val } : n))
  }, [selectedId])

  const updateNodePropNum = useCallback((key, val) => {
    if (!selectedId) return
    const num = val === '' ? null : +val
    setNodes(arr => arr.map(n => n.id === selectedId ? { ...n, [key]: num } : n))
  }, [selectedId])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    setNodes(arr => arr.filter(n => n.id !== selectedId))
    setEdges(arr => arr.filter(e => e.source !== selectedId && e.target !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  // Управление рёбрами
  const onEdgeAdd = useCallback((sourceId, targetId, coeff) => {
    setEdges(arr => {
      const ids = new Set(arr.map(e => e.id))
      const id = nextId('edge', ids)
      return [...arr, { id, source: sourceId, target: targetId, coeff }]
    })
  }, [])

  const onEdgeCoeffEdit = useCallback((edgeId, coeff) => {
    setEdges(arr => arr.map(e => e.id === edgeId ? { ...e, coeff } : e))
  }, [])

  // Шаблоны / очистка
  const loadTemplate = useCallback((key) => {
    const t = TEMPLATES[key]
    if (!t) return
    setNodes(deepCopy(t.nodes))
    setEdges(deepCopy(t.edges))
    setDirection(t.direction)
    setSelectedId(null)
    setResult(null)
    setStatus(''); setStatusClass('')
    setCurrentModelId(null)
    setCurrentModelName('')
    setCurrentModelDesc('')
    cursorRef.current = { x: 100, y: 100 }
    toast.info(`Загружен шаблон: ${t.name}`)
  }, [toast])

  const clearCanvas = useCallback(() => {
    if (!window.confirm('Очистить рабочую область?')) return
    setNodes([]); setEdges([]); setSelectedId(null); setResult(null)
    setStatus(''); setStatusClass('')
    setCurrentModelId(null); setCurrentModelName(''); setCurrentModelDesc('')
    cursorRef.current = { x: 100, y: 100 }
  }, [])

  // Сборка payload для решателя
  const buildGraph = useCallback(() => ({
    direction,
    nodes: nodes.map(n => ({ ...n })),
    edges: edges.map(e => ({ ...e })),
  }), [direction, nodes, edges])

  // Validate / Solve / LP-text
  const validateModel = useCallback(async () => {
    if (nodes.length === 0) {
      toast.warning('Добавьте узлы перед проверкой')
      return
    }
    setBusy(true)
    try {
      const res = await api.validate(buildGraph())
      if (res.status === 'Valid') {
        toast.success(`Модель валидна — переменных: ${res.n_vars}, ограничений: ${res.n_constraints}${res.is_milp ? ' (MIP)' : ' (LP)'}`)
      } else {
        toast.error(res.error || 'Ошибка валидации')
      }
    } finally {
      setBusy(false)
    }
  }, [nodes, buildGraph, toast])

  const solveModel = useCallback(async () => {
    if (nodes.length === 0) {
      toast.warning('Добавьте узлы перед решением')
      return
    }
    setBusy(true)
    setStatus('Решаем…'); setStatusClass('st-solving')
    try {
      const payload = { graph: buildGraph(), config }
      if (currentModelId) payload.model_id = currentModelId
      const res = await api.solve(payload)
      setResult(res)

      const stClass = {
        Optimal: 'st-optimal',
        Infeasible: 'st-error',
        Unbounded: 'st-error',
        Error: 'st-error',
        TimeLimit: 'st-solving',
        Feasible: 'st-solving',
      }[res.status] || 'st-solving'
      setStatus(res.status || 'Error')
      setStatusClass(stClass)

      if (res.status === 'Error') {
        toast.error(res.error || 'Ошибка решателя')
      } else if (res.status === 'Optimal') {
        toast.success(`Оптимум найден: z = ${res.objective_value}`)
      } else {
        toast.warning(`Статус: ${res.status}`)
      }

      if (res.db_warning) toast.warning(res.db_warning)

      // Обновляем историю, если активна вкладка
      refreshHistoryForCurrent()
    } catch (err) {
      setStatus('Error'); setStatusClass('st-error')
      toast.error(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }, [nodes, buildGraph, config, currentModelId, refreshHistory, toast])

  const showLpText = useCallback(async () => {
    if (nodes.length === 0) {
      toast.warning('Добавьте узлы')
      return
    }
    // Сначала пробуем серверный — он точнее (использует тот же translator)
    const res = await api.getLpText(buildGraph())
    if (res.status === 'OK' && res.lp_text) {
      setLpModal({ open: true, text: res.lp_text })
      return
    }
    // Fallback — локальное построение
    try {
      const txt = buildLpTextLocal(buildGraph())
      setLpModal({ open: true, text: txt })
    } catch (_) {
      toast.error(res.error || 'Не удалось построить LP-текст')
    }
  }, [nodes, buildGraph, toast])

  // Экспорт CSV
  const exportCsv = useCallback(() => {
    if (!result || !result.variables) {
      toast.warning('Нет данных для экспорта')
      return
    }
    const rows = ['Переменная;Значение']
    rows.push('Целевая функция;' + (result.objective_value ?? ''))
    Object.entries(result.variables).forEach(([k, v]) => rows.push(`${k};${v}`))
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'loms_result.csv'
    a.click()
  }, [result, toast])

  // Сохранение в БД
  const onSaveClick = useCallback(() => {
    if (nodes.length === 0) {
      toast.warning('Нечего сохранять — добавьте узлы')
      return
    }
    setSaveModal(true)
  }, [nodes, toast])

  const handleSaveSubmit = useCallback(async (name, description) => {
    setSaveModal(false)
    const graph = buildGraph()

    let res
    if (currentModelId) {
      // Обновляем существующую модель + создаём версию
      res = await api.modelUpdate({
        id: currentModelId, name, graph, direction, description,
        save_version: true, version_comment: 'Обновлено из UI',
      })
    } else {
      res = await api.modelCreate({ name, graph, direction, description, tags: [] })
    }

    if (res.status === 'OK' && res.model) {
      setCurrentModelId(res.model.id)
      setCurrentModelName(res.model.name)
      setCurrentModelDesc(res.model.description || '')
      toast.success(currentModelId ? 'Модель обновлена' : `Модель сохранена (id ${res.model.id})`)
      refreshSavedModels()
    } else {
      toast.error(res.error || 'Ошибка сохранения')
    }
  }, [buildGraph, currentModelId, direction, refreshSavedModels, toast])

  // Загрузка модели из БД
  const loadSavedModel = useCallback(async (id) => {
    const res = await api.modelGet(id)
    if (res.status !== 'OK' || !res.model) {
      toast.error(res.error || 'Не удалось загрузить модель')
      return
    }
    const m = res.model
    setNodes(deepCopy(m.graph?.nodes || []))
    setEdges(deepCopy(m.graph?.edges || []))
    setDirection(m.direction || m.graph?.direction || 'min')
    setSelectedId(null)
    setResult(null)
    setStatus(''); setStatusClass('')
    setCurrentModelId(m.id)
    setCurrentModelName(m.name)
    setCurrentModelDesc(m.description || '')
    cursorRef.current = { x: 100, y: 100 }
    toast.success(`Загружена: ${m.name}`)
  }, [toast])

  const deleteSavedModel = useCallback(async (id, name) => {
    if (!window.confirm(`Удалить модель «${name}»? Это действие нельзя отменить.`)) return
    const res = await api.modelDelete(id)
    if (res.status === 'OK') {
      toast.success('Модель удалена')
      refreshSavedModels()
      if (currentModelId === id) {
        setCurrentModelId(null); setCurrentModelName(''); setCurrentModelDesc('')
      }
    } else {
      toast.error(res.error || 'Ошибка удаления')
    }
  }, [currentModelId, refreshSavedModels, toast])

  // Версии
  const showVersions = useCallback(async () => {
    if (!currentModelId) {
      toast.info('Версии доступны только для сохранённой модели')
      return
    }
    const res = await api.modelVersions(currentModelId)
    if (res.status === 'OK') {
      setVersionsModal({ open: true, versions: res.versions || [] })
    } else {
      toast.error(res.error || 'Ошибка загрузки версий')
    }
  }, [currentModelId, toast])

  const restoreVersion = useCallback(async (versionId, versionNum) => {
    if (!currentModelId) return
    if (!window.confirm(`Восстановить версию ${versionNum}? Текущее состояние будет сохранено как новая версия.`)) return
    const res = await api.modelRestore(currentModelId, versionId)
    if (res.status === 'OK' && res.model) {
      setNodes(deepCopy(res.model.graph?.nodes || []))
      setEdges(deepCopy(res.model.graph?.edges || []))
      setDirection(res.model.direction || 'min')
      setSelectedId(null)
      toast.success(`Восстановлена версия ${versionNum}`)
      setVersionsModal({ open: false, versions: [] })
    } else {
      toast.error(res.error || 'Ошибка восстановления')
    }
  }, [currentModelId, toast])

  // История: загрузка снапшота графа из записи истории
  const loadHistoryEntry = useCallback(async (resultId) => {
    const res = await api.resultGet(resultId)
    if (res.status !== 'OK' || !res.result) {
      toast.error(res.error || 'Не удалось загрузить запись истории')
      return
    }
    const r = res.result
    // У SolveResult есть variables и status, но не graph_snapshot в to_dict.
    // Просто показываем результат в правой панели:
    setResult({
      status:          r.status,
      objective_value: r.objective_value,
      variables:       r.variables,
      solve_time_sec:  r.solve_time_sec,
      solver:          r.solver_name,
    })
    toast.info(`Загружен результат от ${new Date(r.solved_at).toLocaleString()}`)
  }, [toast])

  // Импорт/экспорт .loms через файловые диалоги Electron
  const exportToFile = useCallback(async () => {
    if (nodes.length === 0) {
      toast.warning('Нет данных для экспорта')
      return
    }
    const model = {
      schema_version: '1.0',
      name: currentModelName || 'LOMS Model',
      description: currentModelDesc || '',
      direction, nodes, edges,
    }
    const content = JSON.stringify(model, null, 2)

    if (loms.isElectron) {
      const dlg = await loms.saveFile({
        title: 'Экспорт модели в .loms',
        defaultPath: (currentModelName || 'model') + '.loms',
      })
      if (dlg.canceled || !dlg.filePath) return
      const w = await loms.writeFile(dlg.filePath, content)
      if (w.status === 'OK') toast.success('Модель сохранена в файл')
      else toast.error(w.error || 'Ошибка записи')
    } else {
      // Браузер-fallback: скачивание blob'а
      const blob = new Blob([content], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'model.loms'
      a.click()
    }
  }, [nodes, edges, direction, currentModelName, currentModelDesc, toast])

  const importFromFile = useCallback(async () => {
    if (!loms.isElectron) {
      toast.error('Импорт через диалог доступен только в Electron')
      return
    }
    const dlg = await loms.openFile({ title: 'Открыть .loms' })
    if (dlg.canceled || !dlg.filePaths?.length) return
    const r = await loms.readFile(dlg.filePaths[0])
    if (r.status !== 'OK') { toast.error(r.error || 'Ошибка чтения'); return }
    try {
      const m = JSON.parse(r.content)
      setNodes(deepCopy(m.nodes || []))
      setEdges(deepCopy(m.edges || []))
      setDirection(m.direction || 'min')
      setSelectedId(null); setResult(null)
      setStatus(''); setStatusClass('')
      setCurrentModelId(null)
      setCurrentModelName(m.name || '')
      setCurrentModelDesc(m.description || '')
      toast.success(`Загружено из файла: ${m.name || '(без названия)'}`)
    } catch (err) {
      toast.error('Ошибка разбора JSON: ' + err.message)
    }
  }, [toast])

  // Выбор пресета конфигурации из БД
  const onConfigPickFromDb = useCallback((id) => {
    const cfg = solverConfigs.find(c => c.id === id)
    if (!cfg) return
    setConfig({
      backend: cfg.backend,
      time_limit: cfg.time_limit,
      gap_tolerance: cfg.gap_tolerance,
    })
    toast.info(`Применена конфигурация: ${cfg.name}`)
  }, [solverConfigs, toast])

  const onConfigChange = useCallback((key, val) => {
    setConfig(c => ({ ...c, [key]: val }))
  }, [])

  // Render
  const selectedNode = nodes.find(n => n.id === selectedId) || null
  const currentGraph = view === 'modules' ? buildGraph() : null // для context модулей

  return (
    <>
      <header>
        <div style={{ width: 32, height: 32, background: '#3b82f6', borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 16 }}>L</div>
        <h1>LOMS</h1>
        <span className="badge">1.0.0w4</span>
        <span style={{ fontSize: 12, color: '#93c5fd', marginLeft: 4 }}>
          Low-code Optimization Modeling System
        </span>

        {currentModelName && view === 'graph' &&(
          <span style={{ fontSize: 12, color: '#bfdbfe', marginLeft: 12,
                         background: '#1d4ed8', padding: '2px 8px', borderRadius: 4 }}>
            📁 {currentModelName}
          </span>
        )}
        <div className="spacer"></div>
        
        {view === 'graph' && (
          <>
            <button className="head-btn" onClick={onSaveClick} title="Сохранить в базу данных">
              💾 Сохранить
            </button>
            <button className="head-btn" onClick={showVersions} disabled={!currentModelId}
                    title={currentModelId ? 'Версии модели' : 'Сначала сохраните модель'}>
              🕘 Версии
            </button>
            <button className="head-btn" onClick={exportToFile} title="Экспорт в .loms">
              ⬇ Экспорт
            </button>
            <button className="head-btn" onClick={importFromFile} title="Открыть .loms">
              📂 Открыть
            </button>
          </>
        )}
      </header>

            <div className="app">
        {/* Левая панель — переключается между «Граф» и «Модули» */}
        <div className="sidebar">
          <div className="nav-tabs">
            <button className={`nav-tab ${view === 'graph' ? 'active' : ''}`}
                    onClick={() => setView('graph')}>
              📐 Граф
            </button>
            <button className={`nav-tab ${view === 'modules' ? 'active' : ''}`}
                    onClick={() => setView('modules')}>
              🐍 Модули
            </button>
          </div>

          {view === 'graph' && (
            <div className="sidebar-scroll">
              <Sidebar
                onAddNode={addNode}
                onLoadTemplate={loadTemplate}
                savedModels={savedModels}
                currentModelId={currentModelId}
                onLoadSaved={loadSavedModel}
                onDeleteSaved={deleteSavedModel}
                onRefreshSaved={refreshSavedModels}
              />
            </div>
          )}

          {view === 'modules' && (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div className="sidebar-section">
                <h3>О разделе</h3>
                <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
                  Здесь можно писать собственные Python-скрипты — анализировать модели,
                  вызывать решатель, работать с данными.<br/><br/>
                  Каждый модуль сохраняется в БД и запускается в изолированном
                  процессе с таймаутом.
                </p>
              </div>
              <div className="sidebar-section">
                <h3>Доступно в коде</h3>
                <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.7,
                            fontFamily: 'JetBrains Mono, Consolas, monospace' }}>
                  • <b>numpy</b>, <b>scipy</b><br/>
                  • <b>solver_engine</b><br/>
                  • <b>context</b> — данные UI<br/>
                  • <b>result</b> — куда положить итог
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Центральная область */}
        <div className="main">
          {view === 'graph' && (
            <>
              <Toolbar
                direction={direction}
                onDirectionChange={setDirection}
                onValidate={validateModel}
                onSolve={solveModel}
                onShowLp={showLpText}
                onClear={clearCanvas}
                status={status}
                statusClass={statusClass}
                busy={busy}
              />
              <Canvas
                nodes={nodes}
                edges={edges}
                direction={direction}
                selectedId={selectedId}
                onSelect={onSelect}
                onNodeMove={onNodeMove}
                onEdgeAdd={onEdgeAdd}
                onEdgeCoeffEdit={onEdgeCoeffEdit}
              />
            </>
          )}

          {view === 'modules' && (
            <ModulesEditor
              currentGraph={buildGraph()}
              lastResult={result}
            />
          )}
        </div>

        {/* Правая панель — только в режиме графа */}
        {view === 'graph' && (
          <RightPanel
            selectedNode={selectedNode}
            onUpdateNode={updateNodeProp}
            onUpdateNodeNum={updateNodePropNum}
            onDeleteSelected={deleteSelected}
            result={result}
            config={config}
            onConfigChange={onConfigChange}
            solverConfigs={solverConfigs}
            onConfigPickFromDb={onConfigPickFromDb}
            onExportCsv={exportCsv}
            history={history}
            onLoadHistoryEntry={loadHistoryEntry}
            onRefreshHistory={refreshHistoryForCurrent}
            currentModelId={currentModelId}
            savedModels={savedModels}
          />
        )}
      </div>

      <LpTextModal
        open={lpModal.open}
        lpText={lpModal.text}
        onClose={() => setLpModal({ open: false, text: '' })}
      />

      <SaveModelModal
        open={saveModal}
        onClose={() => setSaveModal(false)}
        onSave={handleSaveSubmit}
        defaultName={currentModelName || 'Новая модель'}
        defaultDesc={currentModelDesc}
      />

      <VersionsModal
        open={versionsModal.open}
        versions={versionsModal.versions}
        onClose={() => setVersionsModal({ open: false, versions: [] })}
        onRestore={restoreVersion}
      />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}
