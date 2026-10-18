import { NATIVE_BROWSER_DIAGNOSTIC, type NativeBrowserDiagnostic } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';

const listeners = new Set<(event: NativeBrowserDiagnostic) => void>();
const log = new Logger('app.native-browser');

export function nativeBrowserDiagnostic(value: unknown): void {
  const parsed = NATIVE_BROWSER_DIAGNOSTIC.safeParse(value);
  if (!parsed.success) {
    log.error('browser.diagnostic_rejected', parsed.error);
    return;
  }
  for (const listener of listeners) listener(parsed.data);
}
export function subscribeNativeBrowserDiagnostic(
  listener: (event: NativeBrowserDiagnostic) => void,
): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}
