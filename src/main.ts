import * as Comlink from 'comlink'
import type { RenderWorkerApi } from './render/render.worker'

const canvas   = document.getElementById('canvas') as HTMLCanvasElement
const offscreen = canvas.transferControlToOffscreen()

const worker   = new Worker(new URL('./render/render.worker.ts', import.meta.url), { type: 'module' })
const renderer = Comlink.wrap<RenderWorkerApi>(worker)

await renderer.init(Comlink.transfer(offscreen, [offscreen]))
