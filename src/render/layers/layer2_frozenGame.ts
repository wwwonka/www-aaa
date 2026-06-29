import { Container, Sprite, Texture, TextureSource } from 'pixi.js'
import { KawaseBlurFilter } from 'pixi-filters'

export interface FrozenGameLayer {
  container:   Container
  activate:    (gl: WebGL2RenderingContext, width: number, height: number) => void
  deactivate:  () => void
  setStrength: (strength: number) => void
}

// GL est bottom-up, PixiJS attend top-down — on flip verticalement
function flipY(src: Uint8Array, width: number, height: number): Uint8Array {
  const dst    = new Uint8Array(src.length)
  const stride = width * 4
  for (let y = 0; y < height; y++) {
    dst.set(src.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride)
  }
  return dst
}

export function createFrozenGameLayer(): FrozenGameLayer {
  const container = new Container()
  container.visible = false

  let sprite: Sprite | null           = null
  let filter: KawaseBlurFilter | null = null

  return {
    container,

    activate(gl: WebGL2RenderingContext, width: number, height: number) {
      // Capture le framebuffer courant (Babylon + gameUI du dernier frame)
      const pixels = new Uint8Array(width * height * 4)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

      const source  = new TextureSource({ resource: flipY(pixels, width, height), width, height })
      const texture = new Texture({ source })

      filter  = new KawaseBlurFilter({ strength: 0, quality: 4 })
      sprite  = new Sprite(texture)
      sprite.width   = width
      sprite.height  = height
      sprite.filters = [filter]

      container.addChild(sprite)
      container.visible = true
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
