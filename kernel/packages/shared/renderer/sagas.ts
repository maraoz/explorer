import future from 'fp-future'
import { call, put, take } from 'redux-saga/effects'

import { DEBUG_MESSAGES } from 'config'
import { initializeEngine } from 'unity-interface/dcl'

import { waitingForRenderer } from 'shared/loading/types'
import { createLogger } from 'shared/logger'
import { ReportFatalError } from 'shared/loading/ReportFatalError'
import { StoreContainer } from 'shared/store/rootTypes'

import { UnityLoaderType, UnityGame } from './types'
import { INITIALIZE_RENDERER, InitializeRenderer, engineStarted, messageFromEngine, rendererEnabled } from './actions'

const queryString = require('query-string')

declare const globalThis: StoreContainer
declare const UnityLoader: UnityLoaderType
declare const global: any

const logger = createLogger('renderer: ')

/**
 * InstancedJS is the local instance of Decentraland
 */
let _instancedJS: ReturnType<typeof initializeEngine> | null = null

/**
 * UnityGame instance (Either Unity WebGL or Or Unity editor via WebSocket)
 */
let _gameInstance: UnityGame | null = null

const engineInitialized = future()

export function* rendererSaga() {
  const action: InitializeRenderer = yield take(INITIALIZE_RENDERER)
  yield call(initializeRenderer, action)
  yield engineInitialized
  yield put(rendererEnabled(_instancedJS!))
}

function* initializeRenderer(action: InitializeRenderer) {
  const { container, buildConfigPath } = action.payload

  const qs = queryString.parse(document.location.search)

  preventUnityKeyboardLock()

  if (qs.ws) {
    _gameInstance = initializeUnityEditor(qs.ws, container)
  } else {
    _gameInstance = UnityLoader.instantiate(container, buildConfigPath)
  }

  yield put(waitingForRenderer())

  yield engineInitialized

  yield put(engineStarted())

  return _gameInstance
}

namespace DCL {
  // This function get's called by the engine
  export function EngineStarted() {
    if (!_gameInstance) {
      throw new Error('There is no UnityGame')
    }

    enableLogin()

    _instancedJS = initializeEngine(_gameInstance)

    _instancedJS
      .then(($) => {
        // Expose the "kernel" interface as a global object to allow easier inspection
        global['browserInterface'] = $
        engineInitialized.resolve($)
      })
      .catch((error) => {
        engineInitialized.reject(error)
        ReportFatalError('Unexpected fatal error')
      })
  }

  export function MessageFromEngine(type: string, jsonEncodedMessage: string) {
    if (_instancedJS) {
      if (type === 'PerformanceReport') {
        _instancedJS.then(($) => $.onMessage(type, jsonEncodedMessage)).catch((e) => logger.error(e.message))
        return
      }
      _instancedJS.then(($) => $.onMessage(type, JSON.parse(jsonEncodedMessage))).catch((e) => logger.error(e.message))
    } else {
      logger.error('Message received without initializing engine', type, jsonEncodedMessage)
    }
  }
}

// The namespace DCL is exposed to global because the unity template uses it to
// send the messages
global['DCL'] = DCL

/** This connects the local game to a native client via WebSocket */
function initializeUnityEditor(webSocketUrl: string, container: HTMLElement): UnityGame {
  logger.info(`Connecting WS to ${webSocketUrl}`)
  container.innerHTML = `<h3>Connecting...</h3>`
  const ws = new WebSocket(webSocketUrl)

  ws.onclose = function (e) {
    logger.error('WS closed!', e)
    container.innerHTML = `<h3 style='color:red'>Disconnected</h3>`
  }

  ws.onerror = function (e) {
    logger.error('WS error!', e)
    container.innerHTML = `<h3 style='color:red'>EERRORR</h3>`
  }

  ws.onmessage = function (ev) {
    if (DEBUG_MESSAGES) {
      logger.info('>>>', ev.data)
    }

    try {
      const m = JSON.parse(ev.data)
      if (m.type && m.payload) {
        globalThis.globalStore.dispatch(messageFromEngine(m.type, m.payload))
      } else {
        logger.error('Unexpected message: ', m)
      }
    } catch (e) {
      logger.error(e)
    }
  }

  const gameInstance: UnityGame = {
    SendMessage(_obj, type, payload) {
      if (ws.readyState === ws.OPEN) {
        const msg = JSON.stringify({ type, payload })
        ws.send(msg)
      }
    },
    SetFullscreen() {
      // stub
    }
  }

  ws.onopen = function () {
    container.classList.remove('dcl-loading')
    logger.info('WS open!')
    gameInstance.SendMessage('', 'Reset', '')
    container.innerHTML = `<h3  style='color:green'>Connected</h3>`
    DCL.EngineStarted()
  }

  return gameInstance
}

function enableLogin() {
  const wrapper = document.getElementById('eth-login-confirmation-wrapper')
  const spinner = document.getElementById('eth-login-confirmation-spinner')
  if (wrapper && spinner) {
    spinner.style.cssText = 'display: none;'
    wrapper.style.cssText = 'display: flex;'
  }
}

/**
 * Prevent unity from locking the keyboard when there is an
 * active element (like delighted textarea)
 */
function preventUnityKeyboardLock() {
  const originalFunction = window.addEventListener
  window.addEventListener = function (event: any, handler: any, options?: any) {
    if (['keypress', 'keydown', 'keyup'].includes(event)) {
      originalFunction.call(
        window,
        event,
        (e) => {
          if (!document.activeElement || document.activeElement === document.body) {
            handler(e)
          }
        },
        options
      )
    } else {
      originalFunction.call(window, event, handler, options)
    }
    return true
  }
}
