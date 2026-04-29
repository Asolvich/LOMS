/**
 * LOMS Electron Main Process — v1.0
 *
 * Запускает Python IPC-сервер (backend/ipc_server.py) и обеспечивает
 * двусторонний обмен JSON-сообщениями через stdin/stdout.
 *
 * Renderer общается через preload-мост (window.loms.*).
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs   = require('fs')
const { spawn, execFile } = require('child_process')

// Конфиг
const IS_DEV  = process.env.NODE_ENV === 'development' || !app.isPackaged
const DEV_URL = 'http://localhost:5173'
const PRELOAD = path.join(__dirname, 'preload.js')

// Состояние Python
let pyProcess       = null
let pendingRequests = new Map()
let requestCounter  = 0

// Promise, разрешающийся, когда Python готов принимать команды.
// Все вызовы sendToPython() ждут его перед записью в stdin.
let _pyReadyResolve = null
let _pyReadyReject  = null
let pyReady = null

function resetPyReady () {
  pyReady = new Promise((res, rej) => {
    _pyReadyResolve = res
    _pyReadyReject  = rej
  })
}

// Поиск Python
function getPythonExecutable () {
  const projectRoot = path.join(__dirname, '..')

  // 1. .venv — macOS / Linux
  const venvUnix = path.join(projectRoot, '.venv', 'bin', 'python3')
  if (fs.existsSync(venvUnix)) {
    console.log('[main] venv python:', venvUnix)
    return venvUnix
  }
  // 2. .venv — Windows
  const venvWin = path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvWin)) {
    console.log('[main] venv python (win):', venvWin)
    return venvWin
  }
  // 3. Bundled (для упакованного приложения)
  if (!IS_DEV) {
    const b1 = path.join(process.resourcesPath, 'python', 'python3')
    if (fs.existsSync(b1)) return b1
    const b2 = path.join(process.resourcesPath, 'python', 'python.exe')
    if (fs.existsSync(b2)) return b2
  }
  // 4. Системный
  const sys = process.platform === 'win32' ? 'python' : 'python3'
  console.log('[main] system python fallback:', sys)
  return sys
}

function getServerScript () {
  if (!IS_DEV) {
    return path.join(process.resourcesPath, 'backend', 'ipc_server.py')
  }
  return path.join(__dirname, '..', 'backend', 'ipc_server.py')
}

// Preflight: проверка, что зависимости установлены
function checkPythonAsync (pythonExe, script) {
  return new Promise((resolve) => {
    if (path.isAbsolute(pythonExe) && !fs.existsSync(pythonExe)) {
      return resolve({
        ok: false,
        detail: `Python не найден по пути:\n${pythonExe}\n\n` +
                `Создайте виртуальное окружение:\n` +
                `  python3 -m venv .venv\n` +
                `  source .venv/bin/activate   (Linux/macOS)\n` +
                `  .venv\\Scripts\\activate     (Windows)\n` +
                `  pip install -r backend/requirements.txt`,
      })
    }
    if (!fs.existsSync(script)) {
      return resolve({
        ok: false,
        detail: `Скрипт не найден:\n${script}\n\n` +
                `Проверьте, что папка backend/ находится в корне проекта.`,
      })
    }
    execFile(
      pythonExe,
      ['-c', 'import scipy, numpy, sqlalchemy; print("ok")'],
      { timeout: 10000 },
      (err, _stdout, stderr) => {
        if (err) {
          const hint = pythonExe.includes('.venv')
            ? `Активируйте venv и установите зависимости:\n` +
              `  pip install -r backend/requirements.txt`
            : `Установите зависимости:\n` +
              `  pip3 install -r backend/requirements.txt`
          return resolve({
            ok: false,
            detail: `Ошибка импорта Python-библиотек:\n` +
                    `${(stderr || err.message).slice(0, 400)}\n\n${hint}`,
          })
        }
        resolve({ ok: true, detail: 'Все проверки пройдены' })
      }
    )
  })
}

// Запуск Python
async function startPython () {
  const pythonExe = getPythonExecutable()
  const script    = getServerScript()
  const userData  = app.getPath('userData')

  console.log('[main] pythonExe:', pythonExe)
  console.log('[main] script   :', script)
  console.log('[main] userData :', userData)
  console.log('[main] IS_DEV   :', IS_DEV)

  const diag = await checkPythonAsync(pythonExe, script)
  console.log('[main] preflight:', diag.ok ? 'OK' : 'FAIL — ' + diag.detail)

  if (!diag.ok) {
    _pyReadyReject(new Error(diag.detail))
    dialog.showErrorBox('LOMS: Ошибка запуска Python', diag.detail)
    return
  }

  pyProcess = spawn(pythonExe, ['-u', script], {
    env: {
      ...process.env,
      LOMS_USER_DATA:   userData,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  // stdout: парсинг JSON-ответов
  let buf = ''
  pyProcess.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf-8')
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      let msg
      try {
        msg = JSON.parse(t)
      } catch (e) {
        console.warn('[main] non-JSON stdout:', t.slice(0, 200))
        continue
      }

      // Готовность сервера
      if (msg.status === 'READY') {
        _pyReadyResolve()
        console.log('[main] Python ready')
        continue
      }

      // Ответ на конкретный запрос
      const id = msg.__id
      if (id !== undefined && pendingRequests.has(id)) {
        const { resolve, timeout } = pendingRequests.get(id)
        clearTimeout(timeout)
        pendingRequests.delete(id)
        delete msg.__id
        resolve(msg)
      } else {
        console.log('[python →]', t.slice(0, 200))
      }
    }
  })

  // stderr
  let stderrBuf = ''
  pyProcess.stderr.on('data', (d) => {
    const txt = d.toString()
    stderrBuf += txt
    console.error('[python stderr]', txt.trimEnd())
  })

  // exit
  pyProcess.on('exit', (code, signal) => {
    console.warn('[main] Python exited. code =', code, 'signal =', signal)
    pyProcess = null
    for (const [, { reject, timeout }] of pendingRequests) {
      clearTimeout(timeout)
      reject(new Error(`Python завершился (code ${code})`))
    }
    pendingRequests.clear()
    if (code !== 0 && code !== null && stderrBuf.trim()) {
      dialog.showErrorBox(
        'LOMS: Python завершился с ошибкой',
        `Код выхода: ${code}\n\n${stderrBuf.slice(0, 1000)}`
      )
    }
  })

  pyProcess.on('error', (err) => {
    console.error('[main] spawn error:', err.message)
    dialog.showErrorBox(
      'LOMS: Не удалось запустить Python',
      `${err.message}\n\nPython: ${pythonExe}\nСкрипт: ${script}`
    )
  })
}

// Отправка команды в Python
async function sendToPython (cmd, timeoutMs = 60_000) {
  await pyReady   // Ждём, пока spawn() не отработает / READY не придёт

  return new Promise((resolve, reject) => {
    if (!pyProcess || pyProcess.exitCode !== null) {
      return reject(new Error('Python process is not running'))
    }
    const id = ++requestCounter
    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Python timeout (${timeoutMs}ms) action=${cmd?.action}`))
    }, timeoutMs)

    pendingRequests.set(id, { resolve, reject, timeout: timer })

    const payload = JSON.stringify({ ...cmd, __id: id }) + '\n'
    pyProcess.stdin.write(payload, 'utf-8', (err) => {
      if (err) {
        pendingRequests.delete(id)
        clearTimeout(timer)
        reject(err)
      }
    })
  })
}

// Окно
let mainWindow = null

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 900, minHeight: 600,
    title: 'LOMS — Low-code Optimization Modeling System',
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  })

  if (IS_DEV) {
    mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

// IPC handlers
ipcMain.handle('py:command', async (_e, cmd) => {
  try {
    return await sendToPython(cmd, 60_000)
  } catch (err) {
    return { status: 'Error', error: err.message }
  }
})

ipcMain.handle('dialog:openFile', async (_e, opts = {}) =>
  dialog.showOpenDialog(mainWindow, {
    title: opts.title || 'Открыть модель',
    filters: [
      { name: 'LOMS Model', extensions: ['loms'] },
      { name: 'JSON',       extensions: ['json'] },
      { name: 'All Files',  extensions: ['*']    },
    ],
    properties: ['openFile'],
    ...opts,
  })
)

ipcMain.handle('dialog:saveFile', async (_e, opts = {}) =>
  dialog.showSaveDialog(mainWindow, {
    title:       opts.title || 'Сохранить модель',
    defaultPath: opts.defaultPath || 'model.loms',
    filters: [
      { name: 'LOMS Model', extensions: ['loms'] },
      { name: 'JSON',       extensions: ['json'] },
    ],
    ...opts,
  })
)

ipcMain.handle('fs:readFile', async (_e, filePath) => {
  try {
    return { status: 'OK', content: fs.readFileSync(filePath, 'utf-8') }
  } catch (err) {
    return { status: 'Error', error: err.message }
  }
})

ipcMain.handle('fs:writeFile', async (_e, filePath, content) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    return { status: 'OK' }
  } catch (err) {
    return { status: 'Error', error: err.message }
  }
})

ipcMain.handle('app:getVersion',  () => app.getVersion())
ipcMain.handle('app:getUserData', () => app.getPath('userData'))
ipcMain.on    ('shell:openPath', (_e, p) => shell.openPath(p))

// Lifecycle
app.whenReady().then(() => {
  resetPyReady()
  startPython().catch(err => {
    console.error('[main] startPython failed:', err)
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  shutdownPython()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  shutdownPython()
})

function shutdownPython () {
  if (!pyProcess) return
  try { pyProcess.stdin.end() } catch (_) {}
  try { pyProcess.kill() }      catch (_) {}
  pyProcess = null
}
