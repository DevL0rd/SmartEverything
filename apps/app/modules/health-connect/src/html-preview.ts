import { NativeModule, requireOptionalNativeModule } from 'expo';
import {
  NATIVE_HTML_ID,
  NATIVE_HTML_OPEN,
  NATIVE_HTML_PROJECTION,
  NATIVE_HTML_RETIRED,
  type NativeHtmlPreview,
} from '@smarteverything/domain';

interface HtmlEvents {
  readonly onHtmlRetired: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}
declare class HtmlNative extends NativeModule<HtmlEvents> {
  htmlReady(): boolean;
  htmlLifetimeVersion?(): number;
  htmlPageVersion?(): number;
  htmlProjectVersion?(): number;
  htmlCurrent(id: string): boolean;
  htmlViewReady(): boolean;
  openHtml(json: string): Promise<unknown>;
  releaseHtml(id: string): Promise<void>;
}
const native = requireOptionalNativeModule<HtmlNative>('HubNetwork');
export const androidHtmlPreview: NativeHtmlPreview = {
  pageVersion: (): number => native?.htmlPageVersion?.() ?? 0,
  projectVersion: (): number => native?.htmlProjectVersion?.() ?? 0,
  lifetimeVersion: (): number => native?.htmlLifetimeVersion?.() ?? 1,
  supported: (): boolean =>
    native !== null &&
    typeof native.htmlReady === 'function' &&
    typeof native.htmlCurrent === 'function' &&
    typeof native.htmlViewReady === 'function' &&
    native.htmlViewReady() &&
    typeof native.openHtml === 'function' &&
    typeof native.releaseHtml === 'function' &&
    native.htmlReady(),
  open: async (input) => {
    if (native === null) throw new Error('Native HTML projection is unavailable.');
    return NATIVE_HTML_PROJECTION.parse(
      await native.openHtml(JSON.stringify(NATIVE_HTML_OPEN.parse(input))),
    );
  },
  release: async (id) => {
    if (native === null) throw new Error('Native HTML projection is unavailable.');
    await native.releaseHtml(NATIVE_HTML_ID.parse(id));
  },
};
export function onNativeHtmlRetired(listener: (id: string) => void): () => void {
  if (native === null || typeof native.htmlCurrent !== 'function') return (): void => undefined;
  const subscription = native.addListener('onHtmlRetired', (payload) => {
    listener(NATIVE_HTML_RETIRED.parse(payload).id);
  });
  return (): void => {
    subscription.remove();
  };
}

export function nativeHtmlCurrent(id: string): boolean {
  return (
    native !== null &&
    typeof native.htmlCurrent === 'function' &&
    native.htmlCurrent(NATIVE_HTML_ID.parse(id))
  );
}
