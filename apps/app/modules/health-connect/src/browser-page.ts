import { NativeModule, requireOptionalNativeModule } from 'expo';
import {
  BrowserPageDriver,
  type BrowserPageReading,
  type NativeBrowserPage,
} from '@smarteverything/domain';
type BrowserEvents = Readonly<Record<string, (value: unknown) => void>>;
declare class BrowserNative extends NativeModule<BrowserEvents> {
  browserProfileReady(): boolean;
  browserEvaluate(id: string, code: string): Promise<string>;
  browserPress(id: string, json: string): Promise<void>;
}
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
export function androidBrowserPage(): NativeBrowserPage | undefined {
  const module = native;
  if (
    module === null ||
    typeof module.browserEvaluate !== 'function' ||
    typeof module.browserPress !== 'function'
  )
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
export function androidBrowserProfileReady(): boolean {
  return (
    native !== null &&
    typeof native.browserProfileReady === 'function' &&
    native.browserProfileReady()
  );
}
