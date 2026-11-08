import { desktopBridge, isNative } from '../../../design/platform';
import { nativeSource } from './native-source';
import { desktopSource } from './desktop-source';
import type { LocalMediaSource } from './types';

export function localMediaSource(): LocalMediaSource | null {
  if (isNative()) return nativeSource;
  return desktopBridge()?.photos === undefined ? null : desktopSource;
}

export function resolveLocalMedia(id: string): Promise<string | null> {
  return localMediaSource()?.resolve(id) ?? Promise.resolve(null);
}
