import { z } from 'zod';
import { AI_PROJECT_PATH } from './ai-project-files';
import { NATIVE_HUB_CREDENTIAL_BINDING } from './hub-native';

export const CHAT_FILES_PATH = '/api/ai/chats/:chatId/files/*path';
export const NATIVE_HTML_SCHEME = 'se-preview-html';
export const CHAT_PAGE_PATH = z
  .string()
  .refine(
    (value) => value.startsWith('/') && AI_PROJECT_PATH.safeParse(value.slice(1)).success,
    'Use a page path inside the chat project, such as /workspace/site/index.html.',
  );
export const CHAT_PAGE = z.strictObject({ chatId: z.uuid(), path: CHAT_PAGE_PATH });
export type ChatPage = z.infer<typeof CHAT_PAGE>;

export function encodedPagePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
export function chatFilesUrl(chatId: string, path: string): string {
  return `/api/ai/chats/${encodeURIComponent(chatId)}/files${encodedPagePath(path)}`;
}

export const NATIVE_HTML_ID = z.string().regex(/^[0-9a-f]{64}$/);
export const NATIVE_HTML_RETIRED = z.strictObject({ id: NATIVE_HTML_ID });
export const NATIVE_PAGE_OPEN = z.strictObject({
  scopeId: z.string().min(1).max(200),
  binding: z.lazy(() => NATIVE_HUB_CREDENTIAL_BINDING),
  authorization: z.string().min(1).max(4096),
  page: CHAT_PAGE,
});
export type NativePageOpen = z.infer<typeof NATIVE_PAGE_OPEN>;
export const NATIVE_HTML_PROJECTION = z.strictObject({
  id: NATIVE_HTML_ID,
  url: z.url().refine((value) => {
    const url = new URL(value);
    const custom =
      url.protocol === `${NATIVE_HTML_SCHEME}:` &&
      /^[0-9a-f]{64}$/.test(url.hostname) &&
      url.port === '';
    const loopback =
      url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number(url.port) > 0;
    return (
      (custom || loopback) &&
      /^\/(?!\/)/u.test(url.pathname) &&
      [url.search, url.hash, url.username, url.password].every((part) => part === '')
    );
  }, 'A chat page opens on its own loopback or app origin'),
});
export type NativeHtmlProjection = z.infer<typeof NATIVE_HTML_PROJECTION>;
export interface NativeHtmlPreview {
  supported(): boolean;
  open(input: NativePageOpen): Promise<NativeHtmlProjection>;
  release(id: string): Promise<void>;
}
