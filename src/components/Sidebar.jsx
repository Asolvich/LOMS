import React from 'react'
import { TEMPLATE_LIST } from '../utils/templates'

export default function Sidebar({
  onAddNode, onLoadTemplate,
  savedModels, onLoadSaved, onDeleteSaved, onRefreshSaved,
}) {
  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <h3>Компоненты</h3>
        <button className="node-btn" onClick={() => onAddNode('variable')}>
          <span className="dot dot-var"></span>Переменная решения
        </button>
        <button className="node-btn" onClick={() => onAddNode('constraint')}>
          <span className="dot dot-con"></span>Ограничение
        </button>
        <button className="node-btn" onClick={() => onAddNode('objective')}>
          <span className="dot dot-obj"></span>Целевая функция
        </button>
      </div>

      <div className="sidebar-section">
        <h3>Шаблоны задач</h3>
        {TEMPLATE_LIST.map(t => (
          <button key={t.key}
                  className="tmpl-btn"
                  onClick={() => onLoadTemplate(t.key)}>
            {t.icon} {t.title}
            <small>{t.subtitle}</small>
          </button>
        ))}
      </div>

      <div className="sidebar-section">
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Мои модели</span>
          <button onClick={onRefreshSaved}
                  title="Обновить список"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 12 }}>
            ⟳
          </button>
        </h3>
        {savedModels.length === 0 ? (
          <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 0' }}>
            Сохранённых моделей пока нет
          </div>
        ) : savedModels.map(m => (
          <div key={m.id} className="saved-item">
            <div className="saved-name" onClick={() => onLoadSaved(m.id)} title={m.name}>
              {m.name}
              <small>{new Date(m.updated_at).toLocaleString()}</small>
            </div>
            <button className="saved-del"
                    onClick={(e) => { e.stopPropagation(); onDeleteSaved(m.id, m.name) }}
                    title="Удалить">×</button>
          </div>
        ))}
      </div>

      <div className="sidebar-section" style={{ flex: 1 }}>
        <h3>Справка</h3>
        <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
          1. Добавьте переменные и ограничения<br/>
          2. Настройте параметры в правой панели<br/>
          3. Проведите рёбра от переменных к ограничениям<br/>
          4. Нажмите <strong>Решить</strong>
        </p>
      </div>
    </div>
  )
}
