import { jsonFetch } from 'atomicHelpers/jsonFetch'
import { future, IFuture } from 'fp-future'
import { ILand, ContentMapping } from 'shared/types'
import { CatalystClient } from 'dcl-catalyst-client'
import { EntityType } from 'dcl-catalyst-commons'
import { HALLOWEEN } from 'config'

export type DeployedScene = {
  parcel_id: string
  root_cid: string
  scene_cid: ''
}

export type SceneMappingResponse = {
  data: Array<DeployedScene>
}

function getSceneIdFromSceneMappingResponse(scene: DeployedScene) {
  return scene.root_cid
}

export type TileIdPair = [string, string | null]

export class EmptyParcelController {
  emptyScenes!: Record<string, ContentMapping[]>
  emptyScenesPromise?: Promise<Record<string, ContentMapping[]>>
  emptySceneNames: string[] = []
  baseUrl: string = ''

  constructor(
    public options: {
      contentServer: string
      metaContentServer: string
      metaContentService: string
      contentServerBundles: string
    }
  ) {
    if (HALLOWEEN) {
      this.baseUrl = globalThis.location.origin + '/loader/empty-scenes-halloween/'
    } else {
      this.baseUrl = globalThis.location.origin + '/loader/empty-scenes/'
    }
  }

  async resolveEmptyParcels() {
    if (!this.emptyScenesPromise) {
      this.emptyScenesPromise = jsonFetch(this.baseUrl + 'index.json').then((scenes) => {
        this.emptySceneNames = Object.keys(scenes)
        this.emptyScenes = scenes
        return this.emptyScenes
      })
    }
  }

  isEmptyParcel(sceneId: string): boolean {
    return sceneId.endsWith('00000000000000000000')
  }

  createFakeILand(sceneId: string, coordinates: string): ILand {
    const sceneName = this.emptySceneNames[Math.floor(Math.random() * this.emptySceneNames.length)]

    return {
      sceneId: sceneId,
      baseUrl: this.baseUrl + 'contents/',
      baseUrlBundles: this.options.contentServerBundles,
      sceneJsonData: {
        display: { title: 'Empty parcel' },
        contact: { name: 'Decentraland' },
        owner: '',
        main: `bin/game.js`,
        tags: [],
        scene: { parcels: [coordinates], base: coordinates },
        policy: {},
        communications: { commServerUrl: '' }
      },
      mappingsResponse: {
        parcel_id: coordinates,
        root_cid: sceneId,
        contents: this.emptyScenes[sceneName]
      }
    }
  }
}

export class SceneDataDownloadManager {
  positionToSceneId: Map<string, IFuture<string | null>> = new Map()
  sceneIdToLandData: Map<string, IFuture<ILand | null>> = new Map()
  rootIdToLandData: Map<string, IFuture<ILand | null>> = new Map()
  emptyParcelController: EmptyParcelController
  catalyst: CatalystClient

  constructor(
    public options: {
      contentServer: string
      metaContentServer: string
      metaContentService: string
      contentServerBundles: string
    }
  ) {
    this.emptyParcelController = new EmptyParcelController(options)
    this.catalyst = new CatalystClient(options.metaContentServer, 'EXPLORER')
  }

  async resolveSceneSceneIds(tiles: string[]): Promise<TileIdPair[]> {
    this.emptyParcelController.resolveEmptyParcels()

    const futures: Promise<TileIdPair>[] = []

    const missingTiles: string[] = []

    for (const tile of tiles) {
      let promise: IFuture<string | null>

      if (this.positionToSceneId.has(tile)) {
        promise = this.positionToSceneId.get(tile)!
      } else {
        promise = future<string | null>()
        this.positionToSceneId.set(tile, promise)
        missingTiles.push(tile)
      }

      futures.push(promise.then((id) => [tile, id]))
    }

    if (missingTiles.length > 0) {
      const scenes = await this.catalyst.fetchEntitiesByPointers(EntityType.SCENE, missingTiles)

      // resolve promises
      for (const scene of scenes) {
        for (const tile of scene.pointers) {
          if (this.positionToSceneId.has(tile)) {
            const promise = this.positionToSceneId.get(tile)
            promise!.resolve(scene.id)
          } else {
            // if we get back a pointer/tile that was not pending => create the future and resolve
            const promise = future<string | null>()
            promise.resolve(scene.id)
            this.positionToSceneId.set(tile, promise)
          }
        }

        const sceneId = scene.id
        const baseUrl = this.options.contentServer + '/contents/'
        const baseUrlBundles = this.options.contentServerBundles

        const content = { contents: scene.content ?? [], parcel_id: scene.metadata?.base, root_cid: scene.id }

        const data: ILand = {
          sceneId,
          baseUrl,
          baseUrlBundles,
          sceneJsonData: scene.metadata,
          mappingsResponse: content
        }

        const pendingSceneData = this.sceneIdToLandData.get(sceneId) || future<ILand | null>()

        if (pendingSceneData.isPending) {
          pendingSceneData.resolve(data)
        }

        if (!this.sceneIdToLandData.has(sceneId)) {
          this.sceneIdToLandData.set(sceneId, pendingSceneData)
        }
      }

      // missing tiles will correspond to empty parcels
      for (const tile of missingTiles) {
        const promise = this.positionToSceneId.get(tile)
        if (promise?.isPending) {
          promise?.resolve(null)
        }
      }
    }

    return Promise.all(futures)
  }

  async resolveSceneSceneId(pos: string): Promise<string | null> {
    return this.resolveSceneSceneIds([pos]).then((pairs) => (pairs.length > 0 ? pairs[0][1] : null))
  }

  setSceneRoots(contents: SceneMappingResponse) {
    for (const result of contents.data) {
      const sceneId = getSceneIdFromSceneMappingResponse(result)
      const promised = this.positionToSceneId.get(result.parcel_id) || future<string | null>()

      if (promised.isPending) {
        promised.resolve(sceneId)
      }

      this.positionToSceneId.set(result.parcel_id, promised)
    }
  }

  async resolveLandData(sceneId: string): Promise<ILand | null> {
    if (this.sceneIdToLandData.has(sceneId)) {
      return this.sceneIdToLandData.get(sceneId)!
    }

    const promised = future<ILand | null>()
    this.sceneIdToLandData.set(sceneId, promised)

    if (this.emptyParcelController.isEmptyParcel(sceneId)) {
      const promisedPos = future<string | null>()
      const pos = sceneId.replace('Qm', '').replace(/m0+/, '')
      promisedPos.resolve(sceneId)
      this.positionToSceneId.set(pos, promisedPos)
      await this.emptyParcelController.emptyScenesPromise
      const scene = this.emptyParcelController.createFakeILand(sceneId, pos)
      promised.resolve(scene)
      return promised
    }

    throw new Error(`scene id not found ${sceneId}`)
  }

  async getParcelDataBySceneId(sceneId: string): Promise<ILand | null> {
    return this.sceneIdToLandData.get(sceneId)!
  }

  async getParcelData(position: string): Promise<ILand | null> {
    const sceneId = await this.resolveSceneSceneId(position)
    if (sceneId === null) {
      return null
    }
    return this.resolveLandData(sceneId)
  }
}
