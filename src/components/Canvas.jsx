import React, { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Canvas — графический редактор.
 *
 *  - Канвас теперь с **скроллом**: внутри есть огромная "сцена" (4000×3000),
 *    позиции узлов в координатах сцены, а не viewport. Это позволяет
 *    нормально работать в маленьком окне.
 *  - **Исправлен баг соединения переменных с ограничениями.**
 *    Раньше при mouseup вызывался window.prompt(), что блокировало UI и
 *    портило e.clientX/Y. Теперь ребро создаётся сразу с coeff=1, а
 *    значение редактируется кликом по лейблу.
 *  - **Drop-зона подсвечивается** при рисовании ребра — пользователь
 *    видит, куда можно отпустить.
 *  - Mouseup ловится на window (а не document) для надёжности.
 * 
 *  TODO:
 *  Сделать перемещение на колесико или ПКМ по канвасу
 *  Сделать более удобный интерфейс с историей
 */

// Размеры виртуальной сцены — большое полотно, по которому скроллят.
const SCENE_W = 4000
const SCENE_H = 3000

export default function Canvas({
  nodes, edges, direction,
  selectedId, onSelect,
  onNodeMove, onEdgeAdd, onEdgeCoeffEdit,
}) {
  const sceneRef = useRef(null)         // контейнер с overflow:auto
  const innerRef = useRef(null)         // внутренний div SCENE_W × SCENE_H
  const nodeRefs = useRef({})           // id -> HTMLElement

  const dragRef  = useRef(null)         // { nodeId, ox, oy }
  const drawRef  = useRef(null)         // { sourceId, mx, my }

  // Текущий target при рисовании ребра — для подсветки drop-зоны.
  const [hoverTarget, setHoverTarget] = useState(null)

  // Перерендер для drag и draw-edge.
  const [, force] = useState(0)
  const [edgeModal, setEdgeModal] = useState(null)
  const rerender = useCallback(() => force(v => v + 1), [])

  // Конвертация client coords - scene coords 
  const clientToScene = useCallback((cx, cy) => {
    const inner = innerRef.current
    if (!inner) return { x: 0, y: 0 }
    const r = inner.getBoundingClientRect()
    return { x: cx - r.left, y: cy - r.top }
  }, [])

  // Drag узлов
  const startDrag = (e, nodeId) => {
    if (e.target.classList.contains('node-port')) return
    e.preventDefault()
    e.stopPropagation()
    onSelect(nodeId)
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    const sc = clientToScene(e.clientX, e.clientY)
    dragRef.current = { nodeId, ox: sc.x - node.x, oy: sc.y - node.y }
  }

  // Рисование ребра
  const startEdge = (e, sourceId) => {
    e.stopPropagation()
    e.preventDefault()
    drawRef.current = { sourceId }
    setHoverTarget(null)
    rerender()
  }

  // Глобальные mousemove / mouseup на window
  useEffect(() => {
    const onMove = (e) => {
      // Drag узла
      if (dragRef.current) {
        const { nodeId, ox, oy } = dragRef.current
        const sc = clientToScene(e.clientX, e.clientY)
        const x = Math.max(0, Math.min(SCENE_W - 200, sc.x - ox))
        const y = Math.max(0, Math.min(SCENE_H - 80,  sc.y - oy))
        onNodeMove(nodeId, x, y)
      }

      // Рисование ребра
      if (drawRef.current) {
        const sc = clientToScene(e.clientX, e.clientY)
        drawRef.current.mx = sc.x
        drawRef.current.my = sc.y

        // Поиск кандидата под курсором — для подсветки drop-зоны.
        const els = document.elementsFromPoint(e.clientX, e.clientY)
        let candidate = null
        for (const el of els) {
          const nodeEl = el.classList?.contains('node')
            ? el
            : el.closest?.('.node')
          if (nodeEl) {
            const tgtId = nodeEl.id.replace('node-', '')
            const tgt = nodes.find(n => n.id === tgtId)
            if (tgt && tgt.type === 'constraint' && tgt.id !== drawRef.current.sourceId) {
              candidate = tgt.id
            }
            break
          }
        }
        if (candidate !== hoverTarget) {
          setHoverTarget(candidate)
        } else {
          rerender()
        }
      }
    }

    const onUp = (e) => {
      dragRef.current = null

      if (drawRef.current) {
        const els = document.elementsFromPoint(e.clientX, e.clientY)
        let targetId = null
        for (const el of els) {
          const nodeEl = el.classList?.contains('node')
            ? el
            : el.closest?.('.node')
          if (nodeEl) {
            const tgtId = nodeEl.id.replace('node-', '')
            const tgt = nodes.find(n => n.id === tgtId)
            if (tgt && tgt.type === 'constraint' && tgt.id !== drawRef.current.sourceId) {
              targetId = tgt.id
            }
            break
          }
        }

        const sourceId = drawRef.current.sourceId
        drawRef.current = null
        setHoverTarget(null)

        console.log(targetId)
        if (targetId) {
          // Создаём ребро с коэффициентом по умолчанию 1.
          // Пользователь меняет его кликом по лейблу.
          setEdgeModal({
            sourceId,
            targetId,
            coeffText: "1",
            error: null
          })
        }
        rerender()
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [nodes, onNodeMove, onEdgeAdd, hoverTarget, clientToScene, rerender])

  // Снять выделение по клику в пустую область
  const onSceneMouseDown = (e) => {
    if (e.target === innerRef.current || e.target.tagName?.toLowerCase() === 'svg') {
      onSelect(null)
    }
  }

  // Хелперы рендера рёбер
  const renderEdges = () => {
    const items = []
    for (const e of edges) {
      const src = nodes.find(n => n.id === e.source)
      const tgt = nodes.find(n => n.id === e.target)
      if (!src || !tgt) continue
      const srcEl = nodeRefs.current[src.id]
      const tgtEl = nodeRefs.current[tgt.id]
      const sw = srcEl?.offsetWidth  ?? 140
      const sh = srcEl?.offsetHeight ?? 50
      const th = tgtEl?.offsetHeight ?? 50

      const x1 = src.x + sw,  y1 = src.y + sh / 2
      const x2 = tgt.x,       y2 = tgt.y + th / 2
      const mx = (x1 + x2) / 2

      items.push(
        <path key={'p-' + e.id}
              className="edge"
              d={`M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`}/>
      )
      items.push(
        <g key={'g-' + e.id}
           className="edge-label-g"
           style={{ cursor: 'pointer' }}
           onClick={() => {
            setEdgeModal({
              edgeId: e.id,
              coeffText: String(e.coeff ?? 1),
              mode: "edit",
              error: null
            })
           }}>
          <rect x={mx - 14} y={(y1 + y2) / 2 - 10}
                width="28" height="18" rx="4"
                fill="#fff" stroke="#cbd5e1" strokeWidth="1"/>
          <text className="edge-label"
                x={mx} y={(y1 + y2) / 2 + 4}
                textAnchor="middle">
            {e.coeff ?? 1}
          </text>
        </g>
      )
    }
    return items
  }

  const renderDrawEdge = () => {
    if (!drawRef.current) return null
    const src = nodes.find(n => n.id === drawRef.current.sourceId)
    if (!src) return null
    const srcEl = nodeRefs.current[src.id]
    const x1 = src.x + (srcEl?.offsetWidth ?? 140)
    const y1 = src.y + (srcEl?.offsetHeight ?? 50) / 2
    const x2 = drawRef.current.mx ?? x1
    const y2 = drawRef.current.my ?? y1
    return <line className="edge-draw" x1={x1} y1={y1} x2={x2} y2={y2}/>
  }

  // Рендер
  return (
    <div className="canvas-area">
      <div className="canvas-scroll" ref={sceneRef}>
        <div className="canvas-scene"
             ref={innerRef}
             style={{ width: SCENE_W, height: SCENE_H }}
             onMouseDown={onSceneMouseDown}>
          <svg className="edges"
               width={SCENE_W} height={SCENE_H}
               viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
            <defs>
              <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5"
                      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M2 1L8 5L2 9" fill="none" stroke="#94a3b8"
                      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
            </defs>
            {renderEdges()}
            {renderDrawEdge()}
          </svg>

          {nodes.length === 0 && (
            <div className="canvas-hint">
              <h2>Рабочая область</h2>
              <p>Добавьте компоненты слева или выберите шаблон</p>
            </div>
          )}

          {nodes.map(n => {
            const typeLabel = {
              variable:   'Переменная',
              constraint: 'Ограничение',
              objective:  'Целевая функция',
            }[n.type]

            let sub
            if (n.type === 'variable') {
              sub = `c=${n.obj_coeff ?? 0}  [${n.lb ?? 0}, ${n.ub ?? '∞'}]`
            } else if (n.type === 'constraint') {
              const sym = n.sense === 'leq' ? '≤' : n.sense === 'geq' ? '≥' : '='
              sub = `${sym} ${n.rhs ?? 0}`
            } else {
              sub = direction === 'min' ? 'Минимизировать' : 'Максимизировать'
            }

            const isHover = hoverTarget === n.id

            return (
              <div
                key={n.id}
                id={'node-' + n.id}
                ref={el => { if (el) nodeRefs.current[n.id] = el }}
                className={
                  'node node-' + n.type +
                  (n.id === selectedId ? ' selected' : '') +
                  (isHover ? ' drop-target' : '')
                }
                style={{ left: n.x + 'px', top: n.y + 'px' }}
                onMouseDown={(e) => startDrag(e, n.id)}
                onClick={(e) => {
                  if (e.target.classList.contains('node-port')) return
                  onSelect(n.id)
                }}
              >
                <div className="node-title">{typeLabel}</div>
                <div className="node-name">{n.name || n.id}</div>
                <div className="node-sub">{sub}</div>

                {n.type === 'variable' && (
                  <div className="node-port"
                       title="Тяните к ограничению"
                       onMouseDown={(e) => startEdge(e, n.id)}/>
                )}
                {n.type === 'constraint' && (
                  <div className="node-port node-port-in"/>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {edgeModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Введите коэффициент</h3>

            <input
              type="text"
              value={edgeModal.coeffText}
              onChange={(e) =>
                setEdgeModal({
                  ...edgeModal,
                  coeffText: e.target.value,
                  error: null
                })
              }
            />

            <div className="modal-actions">
              <button
                onClick={() => {
                  const value = edgeModal.coeffText.trim()

                  if (value == ""){
                    setEdgeModal({
                      ...edgeModal,
                      error: "Введите число"
                    })
                    return
                  }
                  const parsed = Number(value.replace(",","."))
                  if (!Number.isFinite(parsed)){
                    setEdgeModal({
                      ...edgeModal,
                      error: "Некорректный формат числа"
                    })
                    return
                  }
                  if (edgeModal.mode === "edit") {
                    onEdgeCoeffEdit(edgeModal.edgeId, parsed)
                  } else {
                    onEdgeAdd(edgeModal.sourceId, edgeModal.targetId, parsed)
                  }
                  setEdgeModal(null)
                }}
              >
                OK
              </button>

              <button onClick={() => setEdgeModal(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}