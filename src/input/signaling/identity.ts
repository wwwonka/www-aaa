/**
 * Identité de session (code de room, nom de device) — générée sur le main. Le nom n'est jamais
 * persisté ; le code de room l'est par ONGLET (`sessionStorage`, voir {@link persistentRoomCode}).
 */

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) — le code peut être lu/tapé à voix haute.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;
/** Clé sessionStorage du code de room (par onglet — se vide à la fermeture). */
const ROOM_CODE_STORAGE_KEY = 'wwwaaa-room';

const NAME_ADJECTIVES = [
  'SWIFT',
  'BRAVE',
  'CALM',
  'FUZZY',
  'LUCKY',
  'MIGHTY',
  'NIMBLE',
  'QUIET',
  'ROYAL',
  'SUNNY',
  'WILD',
  'ZESTY',
] as const;

const NAME_ANIMALS = [
  'FOX',
  'OTTER',
  'HERON',
  'LYNX',
  'ORCA',
  'PANDA',
  'RAVEN',
  'TIGER',
  'WOLF',
  'YAK',
  'IBIS',
  'GECKO',
] as const;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** Code de room court embarqué dans le QR (`?r=CODE`) — l'espace (31^5) suffit largement pour des sessions éphémères. */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Code de room STABLE pour l'onglet : un reload du receiver garde le MÊME code, donc le `?r=` déjà
 * présent dans l'URL du téléphone reste valide. Sans ça, chaque reload receiver invalide la room et
 * tue le pairing en cours — le cas le plus fréquent de « room morte ». `sessionStorage` = éphémère
 * par onglet (rien ne traîne d'une session à l'autre). Mode privé indisponible → code volatil.
 */
export function persistentRoomCode(): string {
  try {
    const existing = sessionStorage.getItem(ROOM_CODE_STORAGE_KEY);
    if (existing !== null && existing !== '') return existing;
    const code = generateRoomCode();
    sessionStorage.setItem(ROOM_CODE_STORAGE_KEY, code);
    return code;
  } catch {
    return generateRoomCode();
  }
}

/** Nom lisible affiché dans les chips de pairing et les toasts (ex. `SWIFT FOX`). */
export function generateDeviceName(): string {
  return `${pick(NAME_ADJECTIVES)} ${pick(NAME_ANIMALS)}`;
}
