// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PairingOverlay } from './PairingOverlay';
import type { PairingOverlayOptions } from './PairingOverlay';

function mount(overrides: Partial<PairingOverlayOptions> = {}) {
  const root = document.createElement('div');
  const onRetry = vi.fn();
  const onScanAgain = vi.fn();
  const onClose = vi.fn();
  const overlay = new PairingOverlay(root, {
    role: 'controller',
    pageUrl: 'https://example.test/',
    roomCode: null,
    deviceName: 'SWIFT FOX',
    onClose,
    onRetry,
    onScanAgain,
    ...overrides,
  });
  const q = (sel: string): HTMLElement | null => root.querySelector<HTMLElement>(sel);
  const buttons = (): HTMLButtonElement[] => [
    ...root.querySelectorAll<HTMLButtonElement>('.shell-pairing__btn'),
  ];
  return { root, overlay, onRetry, onScanAgain, q, buttons };
}

const status = (q: (sel: string) => HTMLElement | null): string => q('.shell-pairing__status')!.textContent ?? '';
const actionsVisible = (q: (sel: string) => HTMLElement | null): boolean =>
  q('.shell-pairing__actions')!.classList.contains('shell-pairing__actions--visible');

describe('PairingOverlay', () => {
  it('searching : label de recherche, pas de boutons de reprise', () => {
    const { q } = mount({ role: 'receiver' });
    // Le constructeur applique déjà searching.
    expect(status(q)).toBe('SEARCHING FOR A CONTROLLER');
    expect(actionsVisible(q)).toBe(false);
  });

  it('pairing : pastille du peer visible, QR/heading masqués', () => {
    const { overlay, q } = mount();
    overlay.setStatus({ phase: 'pairing', peerName: 'WILD YAK' });
    expect(status(q)).toBe('CONNECTING TO');
    const peer = q('.shell-pairing__peer')!;
    expect(peer.classList.contains('shell-pairing__peer--visible')).toBe(true);
    expect(peer.textContent).toBe('WILD YAK');
  });

  it('paired / reconnecting : labels dédiés', () => {
    const { overlay, q } = mount();
    overlay.setStatus({ phase: 'paired', peerName: 'WILD YAK' });
    expect(status(q)).toBe('PAIRED WITH');
    overlay.setStatus({ phase: 'reconnecting', peerName: 'WILD YAK' });
    expect(status(q)).toBe('RECONNECTING TO');
  });

  it('error/timeout controller : message + RETRY + SCAN AGAIN', () => {
    const { overlay, q, buttons, onRetry, onScanAgain } = mount();
    overlay.setStatus({ phase: 'error', peerName: null, errorReason: 'timeout' });
    expect(status(q)).toBe("COULDN'T REACH THE GAME");
    expect(actionsVisible(q)).toBe(true);

    const labels = buttons().map((b) => b.textContent);
    expect(labels).toEqual(['RETRY', 'SCAN AGAIN']);

    buttons()[0].click();
    expect(onRetry).toHaveBeenCalledOnce();
    buttons()[1].click();
    expect(onScanAgain).toHaveBeenCalledOnce();
  });

  it('error/busy et error/version : messages spécifiques', () => {
    const { overlay, q } = mount();
    overlay.setStatus({ phase: 'error', peerName: null, errorReason: 'busy' });
    expect(status(q)).toBe('GAME ALREADY HAS A CONTROLLER');
    overlay.setStatus({ phase: 'error', peerName: null, errorReason: 'version' });
    expect(status(q)).toBe('VERSION MISMATCH — RELOAD');
  });

  it('receiver : pas de bouton SCAN AGAIN (RETRY seul)', () => {
    const { overlay, buttons } = mount({ role: 'receiver', onScanAgain: undefined });
    overlay.setStatus({ phase: 'error', peerName: null, errorReason: 'timeout' });
    expect(buttons().map((b) => b.textContent)).toEqual(['RETRY']);
  });

  it('retour à searching réaffiche le QR et masque les boutons', () => {
    const { overlay, q } = mount({ role: 'receiver', roomCode: 'ABCDE', onScanAgain: undefined });
    overlay.setStatus({ phase: 'error', peerName: null, errorReason: 'timeout' });
    expect(actionsVisible(q)).toBe(true);
    overlay.setStatus({ phase: 'searching', peerName: null });
    expect(actionsVisible(q)).toBe(false);
    expect(q('.shell-qr')!.classList.contains('shell-pairing__search-only--hidden')).toBe(false);
  });
});
