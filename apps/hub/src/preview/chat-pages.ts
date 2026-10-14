import type { IncomingMessage, ServerResponse } from 'node:http';
import { AI_CHAT_PAGE_PATH, ApiError, chatPageAssetUrl } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { authenticate, type Caller } from '../server/auth';
import type { RawRoute } from '../server/http-server';
import type { PreviewService } from './service';
import { serveProjectAsset } from './project-response';

export function chatPageRoutes(store: Store, preview: PreviewService): readonly RawRoute[] {
  return ['GET', 'HEAD'].map((method) => ({
    method: method === 'GET' ? ('GET' as const) : ('HEAD' as const),
    path: AI_CHAT_PAGE_PATH,
    handle: async (request, response, params): Promise<void> => {
      const caller = authenticate(store, request, 'member');
      const chat = params['chatId'] ?? '';
      const publication = params['publicationId'] ?? '';
      const rest = params['path'] ?? '';
      const query = new URL(request.url ?? '/', 'http://hub.invalid').search;
      await serveChatPage(
        preview,
        caller,
        { request, response },
        {
          chat,
          publication,
          path: `/${rest}${query}`,
          prefix: chatPageAssetUrl(chat, publication, ''),
          ancestors: ["'none'"],
        },
      );
    },
  }));
}

export async function serveChatPage(
  preview: Pick<PreviewService, 'documents'>,
  caller: Caller,
  exchange: { readonly request: IncomingMessage; readonly response: ServerResponse },
  input: {
    readonly chat: string;
    readonly publication: string;
    readonly path: string;
    readonly prefix: string;
    readonly ancestors: readonly string[];
  },
): Promise<void> {
  const { request, response } = exchange;
  if (!['GET', 'HEAD'].includes(request.method ?? ''))
    throw new ApiError('method_not_allowed', 'Pages support GET and HEAD.');
  const publication = preview.documents.visible(caller, input.chat, input.publication);
  if (publication.readAsset !== undefined) {
    await serveProjectAsset(request, response, {
      publication,
      path: input.path,
      prefix: input.prefix,
      signal: new AbortController().signal,
      ancestors: input.ancestors,
      ordinaryPage: true,
    });
    return;
  }
  if (new URL(input.path, 'http://page.invalid').pathname !== '/')
    throw new ApiError('not_found', 'This page has no file at that path.');
  const html = await publication.readHtml();
  preview.documents.visible(caller, input.chat, input.publication);
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': `frame-ancestors ${input.ancestors.join(' ')}`,
  });
  response.end(request.method === 'HEAD' ? undefined : html);
}
