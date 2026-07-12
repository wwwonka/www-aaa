import type QrScanner from 'qr-scanner';

/**
 * Isole le code de room d'un texte scanné : soit une URL complète (`…?r=CODE`, le QR affiché par
 * le receiver), soit un code brut de 5 caractères (saisie/dictée future). Retourne `null` si le
 * texte n'est ni l'un ni l'autre (QR étranger).
 */
export function extractRoomCode(text: string): string | null {
  const raw = text.trim();
  try {
    const r = new URL(raw).searchParams.get('r');
    if (r !== null && r !== '') return r.toUpperCase();
  } catch {
    // pas une URL — on tente le code brut ci-dessous
  }
  const bare = raw.toUpperCase();
  return /^[A-Z0-9]{5}$/.test(bare) ? bare : null;
}

export interface QrScannerHandle {
  /** Ferme le scanner, coupe la caméra et retire l'overlay. Idempotent. */
  close(): void;
}

export interface QrScannerCallbacks {
  /** QR valide décodé → code de room isolé. Le scanner se ferme de lui-même juste avant. */
  onCode(roomCode: string): void;
  /** Permission caméra refusée / absente. Le scanner se ferme de lui-même juste avant. */
  onError(err: unknown): void;
  /** L'utilisateur a fermé le scanner (✕) sans scanner. */
  onClose(): void;
}

/**
 * Scanner QR **in-app** : overlay DOM plein écran (caméra arrière + décodage). Main thread
 * uniquement — un flux caméra ne peut pas vivre dans le worker Pixi. Le décodage est délégué à
 * `qr-scanner` (Nimiq), chargé en **import dynamique** (hors bundle de boot) : il utilise
 * `BarcodeDetector` natif quand dispo (Android/Chrome, zéro coût) et retombe sur son worker ~44 KB
 * sinon (iOS Safari). Utilisé par « USE DEVICE AS CONTROLLER » : on scanne le QR du receiver, on en
 * isole le code de room, puis on rejoint la room à chaud. La permission caméra est demandée
 * explicitement sur ce geste (cohérent avec « aucune découverte silencieuse »).
 */
export function startQrScanner(cb: QrScannerCallbacks): QrScannerHandle {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    background: 'rgba(0,0,0,0.94)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '22px',
    userSelect: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  // Props non-standard (pas typées sur CSSStyleDeclaration) : coupe la loupe iOS sur l'overlay.
  overlay.style.setProperty('-webkit-user-select', 'none');
  overlay.style.setProperty('-webkit-touch-callout', 'none');

  const title = document.createElement('div');
  title.textContent = 'SCAN THE CODE ON YOUR GAME SCREEN';
  Object.assign(title.style, {
    color: '#fff',
    font: '600 15px system-ui, sans-serif',
    letterSpacing: '1.5px',
    textAlign: 'center',
    padding: '0 24px',
  } satisfies Partial<CSSStyleDeclaration>);

  const frame = document.createElement('div');
  Object.assign(frame.style, {
    position: 'relative',
    width: 'min(72vw, 320px)',
    aspectRatio: '1 / 1',
    borderRadius: '20px',
    overflow: 'hidden',
    border: '3px solid rgba(255,255,255,0.9)',
    background: '#111',
  } satisfies Partial<CSSStyleDeclaration>);

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  Object.assign(video.style, {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  } satisfies Partial<CSSStyleDeclaration>);
  frame.appendChild(video);

  const closeBtn = document.createElement('button');
  closeBtn.setAttribute('aria-label', 'Close scanner');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
    right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,0.14)',
    color: '#fff',
    font: '600 20px system-ui, sans-serif',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);

  overlay.append(title, frame, closeBtn);
  document.body.appendChild(overlay);

  let scanner: QrScanner | null = null;
  let closed = false;

  const teardown = (): void => {
    if (closed) return;
    closed = true;
    scanner?.stop();
    scanner?.destroy();
    overlay.remove();
  };

  closeBtn.onclick = (): void => {
    teardown();
    cb.onClose();
  };

  void (async (): Promise<void> => {
    try {
      const { default: QrScannerCtor } = await import('qr-scanner');
      if (closed) return;
      scanner = new QrScannerCtor(
        video,
        (result) => {
          const code = extractRoomCode(result.data);
          if (code !== null) {
            teardown();
            cb.onCode(code);
          }
          // QR décodé mais pas un code valide (QR étranger) → on laisse le scanner continuer.
        },
        { preferredCamera: 'environment', highlightScanRegion: true, returnDetailedScanResult: true },
      );
      await scanner.start();
    } catch (err) {
      teardown();
      cb.onError(err);
    }
  })();

  return { close: teardown };
}
