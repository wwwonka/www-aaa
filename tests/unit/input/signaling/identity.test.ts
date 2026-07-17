// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { generateDeviceName, generateRoomCode, persistentRoomCode } from '../../../../src/input/signaling/identity';

const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

describe('identity', () => {
  beforeEach(() => sessionStorage.clear());

  it('generateRoomCode : 5 caractères de l’alphabet non ambigu', () => {
    expect(generateRoomCode()).toMatch(ROOM_CODE_RE);
  });

  it('generateDeviceName : « ADJECTIF ANIMAL »', () => {
    expect(generateDeviceName()).toMatch(/^[A-Z]+ [A-Z]+$/);
  });

  it('persistentRoomCode : stable sur l’onglet (survit à un « reload »)', () => {
    const first = persistentRoomCode();
    expect(first).toMatch(ROOM_CODE_RE);
    // Deuxième appel = simulate un reload dans le même onglet → même code.
    expect(persistentRoomCode()).toBe(first);
    expect(sessionStorage.getItem('wwwaaa-room')).toBe(first);
  });

  it('persistentRoomCode : réutilise un code déjà stocké', () => {
    sessionStorage.setItem('wwwaaa-room', 'ZZZZZ');
    expect(persistentRoomCode()).toBe('ZZZZZ');
  });
});
