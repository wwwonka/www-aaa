import { Text, TextStyle } from 'pixi.js'
import { UIComponent } from '../UIComponent'

interface TextLabelOptions {
  text:     string
  style?:   Partial<TextStyle>
  onClick?: () => void
  /** Additional hook beyond the default hover tint — e.g. sound, cursor changes elsewhere. */
  onHover?: (hovering: boolean) => void
  /**
   * Registers this label's transform properties (opacity, x, y, scale, rotation) as independent
   * `AnimationRegistry` targets under `` `${animatableId}.<prop>` `` — lets a scenario animate this
   * subcomponent on its own timeline (staggered fade-in, etc.) instead of only the whole screen at once.
   */
  animatableId?: string
}

/** Plain text by default. Becomes interactive (pointer cursor, hover tint) only if `onClick` is provided. */
export class TextLabel extends UIComponent {
  readonly node: Text

  /** @param options - See {@link TextLabelOptions}. */
  constructor({ text, style, onClick, onHover, animatableId }: TextLabelOptions) {
    super()

    this.node = new Text({ text, style: new TextStyle(style) })

    // Yoga a besoin d'une hauteur explicite au premier passage de layout — la mesure intrinsèque
    // du canvas de `Text` n'est pas synchrone au moment du premier calcul, donc une hauteur 'auto'
    // produit une hauteur ~0 (lignes qui se chevauchent). La largeur, elle, doit rester mesurée
    // dynamiquement ('intrinsic') sinon Yoga la traite aussi comme ~0 et le centrage horizontal
    // du panel parent part de travers.
    const fontSize = typeof style?.fontSize === 'number' ? style.fontSize : 16
    this.node.layout = { width: 'intrinsic', height: fontSize * 1.3 }

    if (animatableId) this.registerAnimatable(animatableId)

    this.onClick = onClick
    this.onHover = (isOver) => {
      this.node.tint = isOver ? 0xaaccff : 0xffffff
      onHover?.(isOver)
    }
    if (onClick) this.interactive = true
  }
}
