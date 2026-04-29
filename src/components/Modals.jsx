import React, { useState, useEffect } from 'react'

// Универсальная обёртка модалки
function ModalShell({ open, onClose, title, wide, children, footer }) {
  if (!open) return null

  return (
    <div className="modal-overlay open"
         onClick={(e) => { if (e.target.classList.contains('modal-overlay')) onClose() }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`}>
        <h2>
          <span>{title}</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </h2>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  )
}

// LP-текст
export function LpTextModal({ open, lpText, onClose }) {
  return (
    <ModalShell open={open} onClose={onClose} title="LP-нотация модели">
      <pre className="lp-pre">{lpText || '—'}</pre>
    </ModalShell>
  )
}

// Сохранение модели в БД
export function SaveModelModal({ open, onClose, onSave, defaultName, defaultDesc }) {
  const [name, setName]   = useState(defaultName || 'Новая модель')
  const [desc, setDesc]   = useState(defaultDesc || '')

  useEffect(() => {
    if (open) {
      setName(defaultName || 'Новая модель')
      setDesc(defaultDesc || '')
    }
  }, [open, defaultName, defaultDesc])

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Сохранить модель в базу данных"
      footer={
        <>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary"
                  onClick={() => { if (name.trim()) onSave(name.trim(), desc) }}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="field">
        <label>Название</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus/>
      </div>
      <div className="field">
        <label>Описание (необязательно)</label>
        <textarea value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}/>
      </div>
    </ModalShell>
  )
}

// Просмотр версий модели
export function VersionsModal({ open, onClose, versions, onRestore }) {
  return (
    <ModalShell open={open} onClose={onClose}
                title="История версий модели" wide>
      {(!versions || versions.length === 0) ? (
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>
          Нет сохранённых версий
        </div>
      ) : versions.map(v => (
        <div key={v.id} className="version-item">
          <div className="version-info">
            <div className="version-num">Версия {v.version_number}</div>
            <div className="version-comment">
              {v.comment || '—'} · {new Date(v.created_at).toLocaleString()}
            </div>
          </div>
          <button className="btn"
                  onClick={() => onRestore(v.id, v.version_number)}>
            Восстановить
          </button>
        </div>
      ))}
    </ModalShell>
  )
}
