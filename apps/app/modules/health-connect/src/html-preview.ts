import { NativeModule, requireOptionalNativeModule } from 'expo';
import {
  NATIVE_HTML_ID,
  NATIVE_HTML_PROJECTION,
  NATIVE_HTML_RETIRED,
  NATIVE_PAGE_OPEN,
  type NativeHtmlPreview,
} from '@smarteverything/domain';

interface HtmlEvents {
  readonly onHtmlRetired: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}
declare class HtmlNative extends NativeModule<HtmlEvents> {
  htmlReady(): boolean;
  htmlCurrent(id: string): boolean;
  htmlViewReady(): boolean;
  openHtml(json: string): Promise<unknown>;
  releaseHtml(id: string): Promise<void>;
}
const native = requireOptionalNativeModule<HtmlNative>('HubNetwork');
export const androidHtmlPreview: NativeHtmlPreview = {
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
    if (native === null) throw new Error('Chat pages are unavailable in this app build.');
    return NATIVE_HTML_PROJECTION.parse(
      await native.openHtml(JSON.stringify(NATIVE_PAGE_OPEN.parse(input))),
    );
  },
  release: async (id) => {
    if (native === null) throw new Error('Chat pages are unavailable in this app build.');
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
