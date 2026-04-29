/**
 * LOMS Electron Preload
 *
 * Безопасный мост renderer ↔ main. Renderer НИКОГДА не получает
 * прямого доступа к Node API, только через эти функции.
 *
 * window.loms API:
 *   loms.py(cmd)              — отправить команду Python IPC
 *   loms.openFile(opts)       — диалог открытия файла
 *   loms.saveFile(opts)       — диалог сохранения файла
 *   loms.readFile(path)       — чтение файла
 *   loms.writeFile(path, txt) — запись файла
 *   loms.getVersion()         — версия приложения
 *   loms.getUserData()        — путь к userData
 *   loms.openPath(path)       — открыть путь в системном проводнике
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('loms', {
  py:          (cmd)             => ipcRenderer.invoke('py:command', cmd),
  openFile:    (opts)            => ipcRenderer.invoke('dialog:openFile', opts),
  saveFile:    (opts)            => ipcRenderer.invoke('dialog:saveFile', opts),
  readFile:    (filePath)        => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile:   (filePath, c)     => ipcRenderer.invoke('fs:writeFile', filePath, c),
  getVersion:  ()                => ipcRenderer.invoke('app:getVersion'),
  getUserData: ()                => ipcRenderer.invoke('app:getUserData'),
  openPath:    (p)               => ipcRenderer.send('shell:openPath', p),
})
