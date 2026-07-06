import type { AssetNamespace } from '../../_dev/vite-asset-manifest-plugin';

/** Synthetic type for files with no subdirectory under a namespace (e.g. `app/app.webmanifest`) — must not appear in the real path. */
export const MISC_TYPE = 'misc';

/** Reconstructs the real on-disk/network path for a manifest entry. Keep in sync with the `type` derivation in vite-asset-manifest-plugin.ts. */
export function assetPath(namespace: AssetNamespace, type: string, filename: string): string {
  return type === MISC_TYPE ? `${namespace}/${filename}` : `${namespace}/${type}/${filename}`;
}
