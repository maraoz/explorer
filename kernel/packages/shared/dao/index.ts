import defaultLogger from '../logger'
import future from 'fp-future'
import { Layer, Realm, Candidate, CatalystLayers } from './types'
import { RootState } from 'shared/store/rootTypes'
import { Store } from 'redux'
import { isRealmInitialized } from './selectors'
import { fetchCatalystNodes } from 'shared/web3'

const zip = <T, U>(arr: Array<T>, ...arrs: Array<Array<U>>) => {
  return arr.map((val, i) => arrs.reduce((a, arr) => [...a, arr[i]], [val] as Array<any>)) as Array<[T, U]>
}

const v = 50
const score = ({ usersCount, maxUsers = 50 }: Layer) => {
  if (usersCount === 0) {
    return -v
  }
  if (usersCount >= maxUsers) {
    return 0
  }

  const p = 3 / (maxUsers ? maxUsers : 50)

  return v + v * Math.cos(p * (usersCount - 1))
}

function ping(url: string): Promise<{ success: boolean; elapsed?: number; result?: CatalystLayers }> {
  const result = future()

  new Promise(() => {
    const http = new XMLHttpRequest()

    let started: Date

    http.onreadystatechange = () => {
      if (http.readyState === XMLHttpRequest.OPENED) {
        started = new Date()
      }
      if (http.readyState === XMLHttpRequest.DONE) {
        const ended = new Date().getTime()
        if (http.status >= 400) {
          result.resolve({
            success: false
          })
        } else {
          result.resolve({
            success: true,
            elapsed: ended - started.getTime(),
            result: JSON.parse(http.responseText) as Layer[]
          })
        }
      }
    }

    http.open('GET', url, false)

    try {
      http.send(null)
    } catch (exception) {
      result.resolve({
        success: false
      })
    }
  }).catch(defaultLogger.error)

  return result
}

export async function fecthCatalystRealms(): Promise<Candidate[]> {
  const nodes = await fetchCatalystNodes()
  if (nodes.length === 0) {
    throw new Error('no nodes are available in the DAO for the current network')
  }

  const results = await Promise.all(nodes.map(node => ping(`${node.domain}/comms/status?includeLayers=true`)))

  const successfulResults = results.filter($ => $.success)

  if (successfulResults.length === 0) {
    throw new Error('no node responded')
  }

  return zip(nodes, successfulResults).reduce(
    (
      union: Candidate[],
      [{ domain }, { elapsed, result, success }]: [
        { domain: string },
        { elapsed?: number; success: boolean; result?: CatalystLayers }
      ]
    ) =>
      union.concat(
        success
          ? result!.layers.map(layer => ({
              catalystName: result!.name,
              domain,
              elapsed: elapsed!,
              layer,
              score: score(layer)
            }))
          : []
      ),
    new Array<Candidate>()
  )
}

export function pickCatalystRealm(candidates: Candidate[]): Realm {
  const sorted = candidates.sort((c1, c2) => {
    const diff = c2.score - c1.score
    return diff === 0 ? c1.elapsed - c2.elapsed : diff
  })

  return { catalystName: sorted[0].catalystName, domain: sorted[0].domain, layer: sorted[0].layer.name }
}

export async function realmInitialized(): Promise<void> {
  const store: Store<RootState> = (window as any)['globalStore']

  const initialized = isRealmInitialized(store.getState())
  if (initialized) {
    return Promise.resolve()
  }

  return new Promise(resolve => {
    const unsubscribe = store.subscribe(() => {
      const initialized = isRealmInitialized(store.getState())
      if (initialized) {
        unsubscribe()
        return resolve()
      }
    })
  })
}
