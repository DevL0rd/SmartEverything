import { Logger } from '@smarteverything/logging';
import { NativeModule, requireOptionalNativeModule } from 'expo';
import {
  BrowserPageDriver,
  NATIVE_BROWSER_OPERATION,
  PREVIEW_PIXELS,
  type NativeBrowserDiagnostics,
  type NativeBrowserDiagnostic,
  type BrowserPageReading,
  type NativeBrowserPage,
  type PreviewPixels,
} from '@smarteverything/domain';
import { subscribeNativeBrowserDiagnostic } from './browser-diagnostics-events';
type BrowserEvents = Readonly<Record<string, (value: unknown) => void>>;
declare class BrowserNative extends NativeModule<BrowserEvents> {
  browserProfileReady(): boolean;
  browserObserveRaw(): Promise<void>;
  browserPerform(json: string): Promise<unknown>;
  browserEvaluate(id: string, code: string): Promise<string>;
  browserPress(id: string, json: string): Promise<void>;
}
const browserLog = new Logger('app.preview-diagnostics');
const native = requireOptionalNativeModule<BrowserNative>('HubNetwork');
const drivers = new Map<string, BrowserPageDriver>();
function pageDriver(module: BrowserNative, id: string): BrowserPageDriver {
  const known = drivers.get(id);
  if (known !== undefined) return known;
  const driver = new BrowserPageDriver({
    evaluate: async (code): Promise<unknown> => {
      const answer: unknown = JSON.parse(await module.browserEvaluate(id, code));
      return answer;
    },
    press: (combo): Promise<void> =>
      module.browserPress(id, JSON.stringify({ key: combo.key, modifiers: combo.modifiers })),
    trusted: null,
  });
  drivers.set(id, driver);
  return driver;
}
function androidBrowserPage(module: BrowserNative): NativeBrowserPage | undefined {
  if (typeof module.browserEvaluate !== 'function' || typeof module.browserPress !== 'function')
    return undefined;
  return {
    perform: async ({ id, operation }): Promise<BrowserPageReading | null> => {
      const driver = pageDriver(module, id);
      if (operation.kind === 'snapshot') return driver.read();
      await driver.perform(operation);
      return null;
    },
  };
}
export function androidBrowserDiagnostics(nativeHtml: boolean): NativeBrowserDiagnostics | null {
  if (
    (!nativeHtml && !androidBrowserProfileReady()) ||
    native === null ||
    typeof native.browserObserveRaw !== 'function'
  )
    return null;
  const page = androidBrowserPage(native);
  return {
    ...(page === undefined ? {} : { page }),
    subscribe: (listener: (event: NativeBrowserDiagnostic) => void): (() => void) => {
      const stop = subscribeNativeBrowserDiagnostic(listener);
      void native.browserObserveRaw().catch((cause: unknown) => {
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
