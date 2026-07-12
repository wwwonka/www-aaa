/**
 * Theatre.js's real on-disk project state shape — validated against a genuine export
 * (`public/game/anim/title-screen.anim.json`), not invented. Matches
 * `@theatre/core`'s internal `ProjectState_Historic`/`SheetState_Historic` types (not exported
 * publicly, so redeclared here narrowly to just what we read).
 */
export interface TheatreOnDiskState {
  sheetsById: Record<
    string,
    {
      staticOverrides?: { byObject: Record<string, Record<string, number>> };
      sequence?: {
        tracksByObject: Record<
          string,
          {
            /** Encoded prop path → track id, e.g. `'["opacity"]'` → `'orLr8O-xH2'`. */
            trackIdByPropPath: Record<string, string>;
            trackData: Record<
              string,
              {
                type: 'BasicKeyframedTrack';
                keyframes: { position: number; value: number }[];
              }
            >;
          }
        >;
      };
    }
  >;
}

export interface FlatAnimationTrack {
  type: 'BasicKeyframedTrack';
  keyframes: { position: number; value: number }[];
}

/**
 * Flattens one sheet's `sequence.tracksByObject` into `{ "objectKey.propName": track }`.
 * `staticOverrides` is never read — a property adjusted in Studio without ever being keyframed
 * isn't "animated", so it never ships in the exported file or the compiled binary.
 *
 * @param state - Full project state, as returned by `studio.createContentOfSaveFile()`.
 * @param sheetName - Theatre sheet to extract (one per animated screen).
 * @returns Tracks keyed by `` `${objectKey}.${propName}` ``, empty if the sheet has no sequence data.
 */
export function extractSheetTracks(
  state: TheatreOnDiskState,
  sheetName: string,
): Record<string, FlatAnimationTrack> {
  const tracksByObject = state.sheetsById[sheetName]?.sequence?.tracksByObject ?? {};
  const tracks: Record<string, FlatAnimationTrack> = {};

  for (const [objectKey, objectData] of Object.entries(tracksByObject)) {
    for (const [pathEncoded, trackId] of Object.entries(objectData.trackIdByPropPath)) {
      const [propName] = JSON.parse(pathEncoded) as [string];
      const data = objectData.trackData[trackId];
      if (data) tracks[`${objectKey}.${propName}`] = data;
    }
  }

  return tracks;
}
