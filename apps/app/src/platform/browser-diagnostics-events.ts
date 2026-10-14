import { NATIVE_BROWSER_DIAGNOSTIC, type NativeBrowserDiagnostic } from '@smarteverything/domain';
const listeners = new Set<(event: NativeBrowserDiagnostic) => void>();
export function nativeBrowserDiagnostic(value: unknown): void {
  const event = NATIVE_BROWSER_DIAGNOSTIC.parse(value);
  for (const listener of listeners) listener(event);
}
export function subscribeNativeBrowserDiagnostic(
  listener: (event: NativeBrowserDiagnostic) => void,
): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}
