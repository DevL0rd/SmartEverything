import { Logger } from '@smarteverything/logging';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import {
  NATIVE_BROWSER_OPERATION,
  PREVIEW_PIXELS,
  type NativeBrowserDiagnostics,
  type NativeBrowserDiagnostic,
  type PreviewPixels,
} from '@smarteverything/domain';
import { subscribeNativeBrowserDiagnostic } from '../../../src/platform/browser-diagnostics-events';
type BrowserEvents = Readonly<Record<string, (value: unknown) => void>>;
declare class BrowserNative extends NativeModule<BrowserEvents> {
  browserDiagnosticsVersion(): number;
  browserProfileReady(): boolean;
  browserObserve(): Promise<void>;
  browserDiagnosticsRawVersion?(): number;
  browserObserveRaw?(): Promise<void>;
  browserPerform(json: string): Promise<unknown>;
}
const browserLog = new Logger('app.preview-diagnostics');
const native = requireOptionalNativeModule<BrowserNative>('HubNetwork');
export function androidBrowserDiagnostics(nativeHtml: boolean): NativeBrowserDiagnostics | null {
  if (
    (!nativeHtml && !androidBrowserProfileReady()) ||
    native === null ||
    typeof native.browserDiagnosticsVersion !== 'function' ||
    native.browserDiagnosticsVersion() !== 1
  )
    return null;
  return {
    version: 1,
    ...(native.browserDiagnosticsRawVersion?.() === 2 && native.browserObserveRaw !== undefined
      ? {
          rawVersion: 2 as const,
          subscribeRaw: (listener: (event: NativeBrowserDiagnostic) => void): (() => void) => {
            const stop = subscribeNativeBrowserDiagnostic(listener);
            void native.browserObserveRaw?.().catch((cause: unknown) => {
              browserLog.error('preview.observe_failed', cause);
            });
            return stop;
          },
        }
      : {}),
    subscribe: (listener: (event: NativeBrowserDiagnostic) => void): (() => void) => {
      const stop = subscribeNativeBrowserDiagnostic(listener);
      void native.browserObserve().catch((cause: unknown) => {
        browserLog.error('preview.observe_failed', cause);
      });
      return stop;
    },
    perform: async (input): Promise<PreviewPixels | null> => {
      const result = await native.browserPerform(
        JSON.stringify(NATIVE_BROWSER_OPERATION.parse(input)),
      );
      return result === null ? null : PREVIEW_PIXELS.parse(result);
    },
  };
}
export function androidBrowserProfileReady(): boolean {
  return (
    native !== null &&
    typeof native.browserProfileReady === 'function' &&
    native.browserProfileReady()
  );
}
