import { Engine, Scene, Color4, RegisterStandardEngineExtensions } from '@babylonjs/core/pure';

RegisterStandardEngineExtensions();
import { sceneSetup } from './scene/sceneSetup';
import { createUIRenderer } from './layers/uiRenderer';
import type { UIRenderer } from './layers/uiRenderer';
import { PauseBlurEffect } from './effects/PauseBlurEffect';
import { ScreenManager } from '../ui/ScreenManager';
import { PauseScreen } from '../ui/screens/PauseScreen';
import { TitleScreen } from '../ui/screens/TitleScreen';
import { InGameScreen } from '../ui/screens/InGameScreen';
import { PairingOverlayScreen } from '../ui/screens/PairingOverlayScreen';
import type { PairingRole } from '../ui/panels/PairingPanel';
import { startRenderLoop } from './renderLoop';
import type { AppState, AppEvent } from '../core/AppOrchestrator';
import { applyAnimatedValue } from './animation/AnimationRegistry';
import { updateAnimations, pausePlayback, resumePlayback } from './animation/AnimationPlayer';
import { dispatchPointerEvent } from './events/pointerBridge';
import type { RelayedPointerData } from './events/pointerBridge';

/** Messages postMessage bruts relayés par le main thread (hors RPC Comlink) — voir `app/events/`. */
type MainThreadMessage =
  | { type: 'resize'; width: number; height: number }
  | { type: 'visibility'; hidden: boolean }
  | ({ type: 'pointer' } & RelayedPointerData);

export class RenderManager {
  private _canvas!: OffscreenCanvas;
  private _engine!: Engine;
  private _scene!: Scene;
  private _gl!: WebGL2RenderingContext;
  private _ui!: UIRenderer;
  private _pauseBlur!: PauseBlurEffect;
  private _screenManager!: ScreenManager;
  private _width!: number;
  private _height!: number;
  private _targetFps!: number;
  private _stopLoop!: () => void;
  private _lastTime: number = 0;
  private _overGameUI: boolean = false;
  private _notifyOverGameUI?: (over: boolean) => void;
  // Fallback sûr si setShellContext n'est jamais appelé (ex. harnais de test) — `qrcode` jette
  // sur une chaîne vide.
  private _shellContext: { role: PairingRole; pageUrl: string } = {
    role: 'receiver',
    pageUrl: 'https://localhost/',
  };
  private _pairingScreen: PairingOverlayScreen | null = null;

  /**
   * @param canvas - The `OffscreenCanvas` transferred from the main thread; Babylon and Pixi share
   * its single WebGL2 context (see project constraints — never two canvases/contexts).
   * @param targetFps - Initial render loop target; see {@link setFps}.
   */
  async init(canvas: OffscreenCanvas, targetFps = 60): Promise<void> {
    this._canvas = canvas;
    this._width = canvas.width || 800;
    this._height = canvas.height || 600;

    this._engine = new Engine(canvas, true, {
      deterministicLockstep: false,
      preserveDrawingBuffer: true,
      stencil: true,
    });
    this._scene = new Scene(this._engine);
    this._scene.clearColor = new Color4(0, 0, 0, 1);

    // _gl est privé chez Babylon mais c'est le seul moyen de partager le contexte avec Pixi
    this._gl = (this._engine as unknown as { _gl: WebGL2RenderingContext })._gl;

    this._ui = await createUIRenderer(this._gl, this._width, this._height);

    // Le vrai OffscreenCanvas comme domElement — cas documenté par Pixi (voir EventSystem.setCursor).
    this._ui.renderer.events.setTargetElement(this._canvas as unknown as HTMLElement);

    this._pauseBlur = new PauseBlurEffect(
      this._ui.frozenGame,
      this._gl,
      () => this._width,
      () => this._height,
    );

    await this._setupScene();
    this._targetFps = targetFps;
    this._stopLoop = startRenderLoop((ts) => this._frame(ts), targetFps);
    this._listenMessages();
  }

  /**
   * Generic entry point for external value injection (dev bridge via Comlink, or any future driver).
   *
   * @param id - Registry id, e.g. `'title.opacity'` — matches what a `UIComponent` registered via `registerAnimatable`.
   * @param value - The value to apply.
   */
  applyExternalValue(id: string, value: number): void {
    applyAnimatedValue(id, value);
  }

  /** Generic — this module doesn't know or care why playback is being paused. */
  pauseAnimationPlayback(): void {
    pausePlayback();
  }

  /** Re-enables playback and immediately restarts the current screen's animation (see `ScreenManager.replayCurrentReveal`). */
  resumeAnimationPlayback(): void {
    resumePlayback();
    this._screenManager?.replayCurrentReveal();
  }

  /**
   * Contexte shell fourni par le main thread avant `setSendToAsm` — le worker ne peut ni détecter
   * le rôle (UA/localStorage vivent côté main) ni lire l'URL de la page (`location` du worker
   * pointe sur le script).
   */
  setShellContext(ctx: { role: PairingRole; pageUrl: string }): void {
    this._shellContext = ctx;
  }

  /** Relaye searching ⇄ paired à l'overlay de pairing — appelé par le main sur `CONTROLLER_CONNECTED`/`_DISCONNECTED`. */
  setControllerPaired(peerName: string | null): void {
    this._pairingScreen?.setPaired(peerName);
  }

  /** @param fn - Callback invoked whenever a screen (e.g. `PauseScreen`) needs to send an `AppEvent` back to the state machine. */
  async setSendToAsm(fn: (event: AppEvent) => void): Promise<void> {
    this._screenManager = new ScreenManager(this._ui.gameUI, this._ui.overlayUI);

    this._screenManager.register('PAUSED', new PauseScreen(fn, this._width, this._height));
    this._screenManager.register(
      'TITLE_SCREEN',
      await TitleScreen.create(this._width, this._height, () => fn({ type: 'OPEN_PAIRING' })),
    );
    this._screenManager.register('IN_GAME', new InGameScreen(this._width, this._height));

    const { role, pageUrl } = this._shellContext;
    // Placeholder aléatoire tant que l'identité Trystero n'existe pas (Étape 2).
    const deviceName = `${role} ${10 + Math.floor(Math.random() * 90)}`;
    this._pairingScreen = await PairingOverlayScreen.create(this._width, this._height, {
      role,
      pageUrl,
      deviceName,
      onClose: () => fn({ type: 'CLOSE_PAIRING' }),
    });
    this._screenManager.register('PAIRING_MODE', this._pairingScreen);
  }

  /**
   * Miroite vers le main thread le fait que le curseur survole un contrôle Pixi interactif.
   * Le main thread ne peut pas hit-tester la scène (elle vit ici), et son handler `dblclick`
   * doit décider synchroniquement s'il déclenche le plein écran — voir
   * `app/platform/pwa/AppWindowFullscreen.ts`.
   *
   * On écoute `pointerover`/`pointerout` sur `stage` : ils bubblent depuis le contrôle
   * interactif touché (`UIComponent` pose `eventMode='static'`), les zones non interactives ne
   * sont jamais cibles de survol. Passer d'un bouton au fond émet donc bien un `pointerout`.
   *
   * @param fn - Callback (proxifié Comlink) invoqué à chaque changement d'état de survol.
   */
  setOverGameUI(fn: (over: boolean) => void): void {
    this._notifyOverGameUI = fn;
    this._ui.stage.on('pointerover', () => this._setOverGameUI(true));
    this._ui.stage.on('pointerout', () => this._setOverGameUI(false));
  }

  private _setOverGameUI(over: boolean): void {
    if (over === this._overGameUI) return;
    this._overGameUI = over;
    this._notifyOverGameUI?.(over);
  }

  /** @param state - The `AppState` to display; also drives the pause-blur transition. */
  showScreen(state: AppState): void {
    if (state === 'PAUSED') {
      this._pauseBlur.enter();
    } else if (this._pauseBlur.isActive) {
      this._pauseBlur.exit();
    }
    this._screenManager?.transition(state);
  }

  /** @param fps - New render loop target; restarts the loop with the new interval. */
  setFps(fps: number): void {
    this._targetFps = fps;
    this._stopLoop();
    this._stopLoop = startRenderLoop((ts) => this._frame(ts), fps);
  }

  dispose(): void {
    this._stopLoop();
    this._ui.destroy();
    this._engine.dispose();
  }

  private _listenMessages(): void {
    self.addEventListener('message', (e: MessageEvent<MainThreadMessage>) => {
      if (e.data?.type === 'resize') {
        const { width: w, height: h } = e.data;
        this._canvas.width = w;
        this._canvas.height = h;
        this._width = w;
        this._height = h;
        this._engine.resize();
        this._ui.resize(w, h);
        this._pauseBlur.resize(w, h);
        this._screenManager?.resize(w, h);
        this._frame(performance.now());
      }
      if (e.data?.type === 'visibility') {
        if (e.data.hidden) {
          this._stopLoop();
        } else {
          this._restartLoop();
        }
      }
      if (e.data?.type === 'pointer') {
        // EventSystem réécrit rootBoundary.rootTarget depuis renderer.lastObjectRendered à chaque
        // event — cette détection ne se met jamais à jour correctement dans notre setup (contexte
        // GL partagé avec Babylon), donc on la réaffirme avant chaque dispatch plutôt qu'une fois.
        this._ui.renderer.events.rootBoundary.rootTarget = this._ui.stage;
        dispatchPointerEvent(this._canvas, this._ui.renderer, e.data);
      }
    });
  }

  private _restartLoop(): void {
    this._stopLoop = startRenderLoop((ts) => this._frame(ts), this._targetFps);
  }

  private async _setupScene(): Promise<void> {
    await sceneSetup(this._engine, this._scene);
  }

  private _frame(ts: number): void {
    const delta = this._lastTime ? ts - this._lastTime : 16;
    this._lastTime = ts;

    this._screenManager?.update(delta);
    updateAnimations(delta);

    if (this._pauseBlur.mode !== 'frozen') {
      this._scene.render();
    }

    this._pauseBlur.update(delta);

    if (this._pauseBlur.isActive) {
      const liveCapture = this._pauseBlur.mode === 'resuming';
      this._ui.renderSplit(this._gl, this._width, this._height, liveCapture);
    } else {
      this._ui.renderNormal(this._gl, this._width, this._height);
    }

    this._engine.wipeCaches(true);
  }
}
