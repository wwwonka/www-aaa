import { Container, Sprite, Texture, TextureSource } from 'pixi.js'
import { KawaseBlurFilter } from 'pixi-filters'

export interface FrozenGameLayer {
  container:   Container
  glTexture:   WebGLTexture | null  // exposé pour copyTexImage2D dans renderSplit
  activate:    (gl: WebGL2RenderingContext, width: number, height: number) => void
  deactivate:  (gl: WebGL2RenderingContext) => void
  setStrength: (strength: number) => void
}

export function createFrozenGameLayer(): FrozenGameLayer {
  const container = new Container()
  container.visible = false

  let glTexture: WebGLTexture | null = null
  let sprite:    Sprite | null       = null
  let filter:    KawaseBlurFilter | null = null

  return {
    container,
    get glTexture() { return glTexture },

    activate(gl: WebGL2RenderingContext, width: number, height: number) {
      // Crée une texture GL vide aux dimensions du canvas
      glTexture = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, glTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindTexture(gl.TEXTURE_2D, null)

      // Enveloppe la texture GL dans un Sprite PixiJS
      const source  = new TextureSource({ resource: glTexture, width, height })
      const texture = new Texture({ source })
      sprite  = new Sprite(texture)
      filter  = new KawaseBlurFilter({ strength: 0, quality: 4 })
      sprite.filters = [filter]
      sprite.width   = width
      sprite.height  = height

      container.addChild(sprite)
      container.visible = true
    },

    deactivate(gl: WebGL2RenderingContext) {
      if (glTexture) {
        gl.deleteTexture(glTexture)
        glTexture = null
      }
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
