import { NATIVE_BROWSER_DIAGNOSTIC } from '@smarteverything/domain';
const listeners = new Set();
export function nativeBrowserDiagnostic(value) {
    const event = NATIVE_BROWSER_DIAGNOSTIC.parse(value);
    for (const listener of listeners)
        listener(event);
}
export function subscribeNativeBrowserDiagnostic(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
//# sourceMappingURL=browser-diagnostics-events.js.map