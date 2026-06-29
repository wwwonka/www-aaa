import { Container, Sprite, Texture, WebGLRenderer } from 'pixi.js'
import { KawaseBlurFilter } from 'pixi-filters'

export interface FrozenGameLayer {
  container:   Container
  activate:    (gl: WebGLRenderer, width: number, height: number) => void
  deactivate:  () => void
  setStrength: (strength: number) => void
}

export function createFrozenGameLayer(): FrozenGameLayer {
  const container = new Container()
  let sprite:      Sprite | null = null
  let filter:      KawaseBlurFilter | null = null

  return {
    container,

    activate(renderer: WebGLRenderer, width: number, height: number) {
      filter = new KawaseBlurFilter({ strength: 0, quality: 4 })
      // Crée une texture depuis le framebuffer courant (Babylon + gameUI déjà rendus)
      const texture = Texture.from(renderer.gl.canvas as HTMLCanvasElement)
      sprite = new Sprite(texture)
      sprite.width  = width
      sprite.height = height
      sprite.filters = [filter]
      container.addChild(sprite)
      container.visible = true
    },

    deactivate() {
      sprite?.destroy()
      sprite  = null
      filter  = null
      container.removeChildren()
      container.visible = false
    },

    setStrength(strength: number) {
      if (filter) filter.strength = strength
    },
  }
}
