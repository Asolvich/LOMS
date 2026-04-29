// Безопасная обёртка над window.loms (preload bridge)
// Если запущено вне Electron — возвращает заглушки, чтобы UI не падал.

const noElectron = typeof window === 'undefined' || !window.loms;

function notInElectronError() {
  return {
    status: 'Error',
    error: 'window.loms недоступен. Приложение запущено вне Electron — функции БД и решателя выключены. Запустите через `npm run dev`.',
  };
}

export const loms = {
  isElectron: !noElectron,

  /** Прямой вызов Python IPC. Возвращает объект-ответ. */
  async py(cmd) {
    if (noElectron) return notInElectronError();
    try {
      return await window.loms.py(cmd);
    } catch (err) {
      return { status: 'Error', error: err?.message || String(err) };
    }
  },

  /** Диалог открытия файла */
  async openFile(opts) {
    if (noElectron) return { canceled: true, filePaths: [] };
    return await window.loms.openFile(opts);
  },

  /** Диалог сохранения файла */
  async saveFile(opts) {
    if (noElectron) return { canceled: true, filePath: null };
    return await window.loms.saveFile(opts);
  },

  /** Чтение файла с диска */
  async readFile(p) {
    if (noElectron) return { status: 'Error', error: 'not in electron' };
    return await window.loms.readFile(p);
  },

  /** Запись файла на диск */
  async writeFile(p, content) {
    if (noElectron) return { status: 'Error', error: 'not in electron' };
    return await window.loms.writeFile(p, content);
  },

  async getVersion() {
    if (noElectron) return 'web-dev';
    return await window.loms.getVersion();
  },
};

// Удобные обёртки над часто используемыми действиями
export const api = {
  ping:        ()                => loms.py({ action: 'ping' }),
  dbStats:     ()                => loms.py({ action: 'db:stats' }),

  // Models
  modelList:   ()                => loms.py({ action: 'model:list' }),
  modelGet:    (id)              => loms.py({ action: 'model:get', id }),
  modelCreate: (payload)         => loms.py({ action: 'model:create', ...payload }),
  modelUpdate: (payload)         => loms.py({ action: 'model:update', ...payload }),
  modelDelete: (id)              => loms.py({ action: 'model:delete', id }),
  modelVersions:(id)             => loms.py({ action: 'model:versions', id }),
  modelRestore:(model_id, version_id) => loms.py({ action: 'model:restore', model_id, version_id }),

  // Solver configs
  configList:  ()                => loms.py({ action: 'solver_config:list' }),
  configDefault:()               => loms.py({ action: 'solver_config:default' }),

  // Results / history
  resultList:  (model_id)        => loms.py({ action: 'result:list', model_id }),
  resultGet:   (id)              => loms.py({ action: 'result:get', id }),

  // Solver actions
  validate:    (graph)           => loms.py({ action: 'validate', graph }),
  getLpText:   (graph)           => loms.py({ action: 'get-lp-text', graph }),
  solve:       (payload)         => loms.py({ action: 'solve', ...payload }),

  // User Python modules
  moduleList:   ()                              => loms.py({ action: 'module:list' }),
  moduleGet:    (id)                            => loms.py({ action: 'module:get', id }),
  moduleCreate: (payload)                       => loms.py({ action: 'module:create', ...payload }),
  moduleUpdate: (payload)                       => loms.py({ action: 'module:update', ...payload }),
  moduleDelete: (id)                            => loms.py({ action: 'module:delete', id }),
  moduleRun:    (payload)                       => loms.py({ action: 'module:run', timeout: 30, ...payload }),
};
