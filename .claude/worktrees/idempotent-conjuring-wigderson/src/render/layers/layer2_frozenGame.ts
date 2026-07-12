import { Container, Sprite, Texture } from 'pixi.js'
import { KawaseBlurFilter } from 'pixi-filters'

export interface FrozenGameLayer {
  container:     Container
  activate:      (gl: WebGL2RenderingContext, width: number, height: number) => void
  captureFrame:  (gl: WebGL2RenderingContext, width: number, height: number) => void
  deactivate:    () => void
  setStrength:   (strength: number) => void
}

// GL est bottom-up, PixiJS attend top-down
function flipY(src: Uint8Array, width: number, height: number): Uint8Array {
  const dst    = new Uint8Array(src.length)
  const stride = width * 4
  for (let y = 0; y < height; y++) {
    dst.set(src.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride)
  }
  return dst
}

function readFramebuffer(gl: WebGL2RenderingContext, width: number, height: number): ImageBitmap {
  const pixels = new Uint8Array(width * height * 4)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

  const offscreen = new OffscreenCanvas(width, height)
  const ctx       = offscreen.getContext('2d')!
  const flipped   = flipY(pixels, width, height)
  ctx.putImageData(new ImageData(new Uint8ClampedArray(flipped.buffer as ArrayBuffer), width, height), 0, 0)
  return offscreen.transferToImageBitmap()
}

export function createFrozenGameLayer(): FrozenGameLayer {
  const container = new Container()
  container.visible = false

  let sprite: Sprite | null           = null
  let filter: KawaseBlurFilter | null = null

  return {
    container,

    // Appelé une fois à l'entrée en pause — capture le dernier frame figé
    activate(gl: WebGL2RenderingContext, width: number, height: number) {
      const bitmap  = readFramebuffer(gl, width, height)
      const texture = Texture.from(bitmap)

      filter = new KawaseBlurFilter({ strength: 0, quality: 4 })
      sprite = new Sprite(texture)
      sprite.width   = width
      sprite.height  = height
      sprite.filters = [filter]

      container.addChild(sprite)
      container.visible = true
    },

    // Appelé chaque frame pendant RESUMING — met à jour la texture avec le frame live
    captureFrame(gl: WebGL2RenderingContext, width: number, height: number) {
      if (!sprite) return
      const bitmap = readFramebuffer(gl, width, height)
      const oldTexture = sprite.texture
      sprite.texture = Texture.from(bitmap)
      sprite.width   = width
      sprite.height  = height
      oldTexture.destroy(true)
    },

    deactivate() {
      sprite?.destroy({ texture: true, textureSource: true })
      sprite = null
      filter = null
      container.removeChildren()
      container.visible = false
    },

    setStrength(strength: number) {
      if (filter) filter.strength = strength
    },
  }
}
