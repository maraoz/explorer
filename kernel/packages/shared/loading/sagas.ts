import { AnyAction } from 'redux'
import { call, delay, fork, put, race, select, take, takeEvery, takeLatest } from 'redux-saga/effects'
import { future, IFuture } from 'fp-future'

import { RENDERER_INITIALIZED } from 'shared/renderer/types'
import { LOGIN_COMPLETED, USER_AUTHENTIFIED } from 'shared/session/actions'
import { web3initialized } from 'shared/dao/actions'
import { queueTrackingEvent } from '../analytics'
import { getCurrentUser } from '../comms/peers'
import { lastPlayerPosition } from '../world/positionThings'

import { SceneLoad, SCENE_FAIL, SCENE_LOAD, SCENE_START } from './actions'
import { LoadingState } from './reducer'
import {
  EXPERIENCE_STARTED,
  loadingTips,
  rotateHelpText,
  TELEPORT_TRIGGERED,
  unityClientLoaded,
  authSuccessful
} from './types'

const SECONDS = 1000

export const DELAY_BETWEEN_MESSAGES = 10 * SECONDS

export function* loadingSaga() {
  yield fork(translateActions)

  yield fork(initialSceneLoading)
  yield takeLatest(TELEPORT_TRIGGERED, teleportSceneLoading)

  yield takeEvery(SCENE_LOAD, trackLoadTime)
}

function* translateActions() {
  yield takeEvery(RENDERER_INITIALIZED, triggerUnityClientLoaded)
  yield takeEvery(USER_AUTHENTIFIED, triggerWeb3Initialized)
  yield takeEvery(LOGIN_COMPLETED, triggerAuthSuccessful)
}

function* triggerAuthSuccessful() {
  yield put(authSuccessful())
}

function* triggerWeb3Initialized() {
  yield put(web3initialized())
}

function* triggerUnityClientLoaded() {
  yield put(unityClientLoaded())
}

export function* trackLoadTime(action: SceneLoad): any {
  const start = new Date().getTime()
  const sceneId = action.payload
  const result = yield race({
    start: take((action: AnyAction) => action.type === SCENE_START && action.payload === sceneId),
    fail: take((action: AnyAction) => action.type === SCENE_FAIL && action.payload === sceneId)
  })
  const user = yield select(getCurrentUser)
  const position = lastPlayerPosition
  queueTrackingEvent('SceneLoadTimes', {
    position: { ...position },
    elapsed: new Date().getTime() - start,
    success: !!result.start,
    sceneId,
    userId: user.userId
  })
}

function* refreshTeleport() {
  while (true) {
    yield delay(DELAY_BETWEEN_MESSAGES)
    yield put(rotateHelpText())
  }
}
function* refreshTextInScreen() {
  while (true) {
    const status = yield select((state) => state.loading)
    yield call(() => updateTextInScreen(status))
    yield delay(200)
  }
}

export function* waitForSceneLoads() {
  while (true) {
    yield race({
      started: take(SCENE_START),
      failed: take(SCENE_FAIL)
    })
    if (yield select((state) => state.loading.pendingScenes === 0)) {
      break
    }
  }
}

function hideLoadingTips() {
  const messages = document.getElementById('load-messages')
  const images = document.getElementById('load-images') as HTMLImageElement | null

  if (messages) {
    messages.style.cssText = 'display: none;'
  }
  if (images) {
    images.style.cssText = 'display: none;'
  }
}

export function* initialSceneLoading() {
  yield race({
    refresh: call(refreshTeleport),
    textInScreen: call(refreshTextInScreen),
    finish: call(function* () {
      yield take(EXPERIENCE_STARTED)
      yield call(hideLoadingTips)
      yield call(cleanSubTextInScreen)
    })
  })
}

export function* teleportSceneLoading() {
  cleanSubTextInScreen()
  yield race({
    refresh: call(refreshTeleport),
    textInScreen: call(function* () {
      yield delay(2000)
      yield call(refreshTextInScreen)
    }),
    finish: call(waitForSceneLoads)
  })
}

const loadingImagesCache: Record<string, IFuture<string>> = {}

export async function updateTextInScreen(status: LoadingState) {
  const messages = document.getElementById('load-messages')
  const images = document.getElementById('load-images') as HTMLImageElement | null
  if (messages && images) {
    const loadingTip = loadingTips[status.helpText]
    if (messages.innerText !== loadingTip.text) {
      messages.innerText = loadingTip.text
    }

    if (!loadingImagesCache[loadingTip.image]) {
      const promise = (loadingImagesCache[loadingTip.image] = future())
      const response = await fetch(loadingTip.image)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      promise.resolve(url)
    }

    const url = await loadingImagesCache[loadingTip.image]
    if (url !== images.src) {
      images.src = url
    }
  }
  const subMessages = document.getElementById('subtext-messages')
  const progressBar = document.getElementById('progress-bar-inner')
  if (subMessages && progressBar) {
    const newMessage = status.pendingScenes > 0 ? status.message || 'Loading scenes...' : status.status
    if (newMessage !== subMessages.innerText) {
      subMessages.innerText = newMessage
    }
    const actualPercentage = Math.floor(
      Math.min(status.initialLoad ? (status.loadPercentage + status.subsystemsLoad) / 2 : status.loadPercentage, 100)
    )
    const newCss = `width: ${actualPercentage}%`
    if (newCss !== progressBar.style.cssText) {
      progressBar.style.cssText = newCss
    }
  }
}

function cleanSubTextInScreen() {
  const subMessages = document.getElementById('subtext-messages')
  if (subMessages) {
    subMessages.innerText = 'Loading scenes...'
  }
  const progressBar = document.getElementById('progress-bar-inner')
  if (progressBar) {
    progressBar.style.cssText = `width: 0%`
  }
}
