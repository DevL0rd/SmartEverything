import { Logger } from '@smarteverything/logging';
import { isNative } from '../design/platform';

const MANIFEST = 'bundle.json';

export function bundleVersionOf(manifest: unknown): string | null {
  if (typeof manifest !== 'object' || manifest === null) {
    return null;
  }
  const version = Reflect.get(manifest, 'runtimeVersion');
  return typeof version === 'string' && version !== '' ? version.slice(0, 40) : null;
}

/** Names the interface build the app is running, when it is a downloaded web bundle. */
export async function nameUiBundle(): Promise<void> {
  if (isNative()) {
    return;
  }
  try {
    const response = await fetch(MANIFEST);
    if (!response.ok) {
      return;
    }
    const version = bundleVersionOf(await response.json());
    if (version !== null) {
      Logger.configure({ context: { bundle: version } });
    }
  } catch (cause) {
    new Logger('app.logging').debug('ui_bundle.unnamed', {
      reason: cause instanceof Error ? cause.name : 'unknown',
    });
  }
}
