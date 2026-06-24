import React, { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext(null)

let _id = 0

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])

  const push = useCallback((message, type = 'info', ttl = 3500) => {
    const id = ++_id
    setItems(arr => [...arr, { id, message, type }])
    if (ttl > 0) {
      setTimeout(() => setItems(arr => arr.filter(t => t.id !== id)), ttl)
    }
    return id
  }, [])

  const api = {
    info:    (m, ttl) => push(m, 'info', ttl),
    success: (m, ttl) => push(m, 'success', ttl),
    error:   (m, ttl) => push(m, 'error', ttl ?? 5000),
    warning: (m, ttl) => push(m, 'warning', ttl ?? 4500),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-container">
        {items.map(t => (
          <div 
          key={t.id} 
          className={`toast toast-${t.type}`}
          onClick={() =>
          setItems(arr => arr.filter(x => x.id !== t.id))
          }>
              {t.message}
            </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
