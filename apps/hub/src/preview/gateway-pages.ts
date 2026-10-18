import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { accessEntryOf, effectiveClient } from '../server/person-access';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { authenticate, type Caller } from '../server/auth';
import type { PreviewDocuments } from './documents';
import { serveChatPage } from './chat-pages';

const PAGE_COOKIE = '__Host-se-pages';
const SESSION_PATH = '/.se-preview/session';
export class GatewayPages {
  private readonly key = randomBytes(32);
  constructor(
    private readonly store: Store,
    private readonly documents: Pick<PreviewDocuments, 'require' | 'visible'>,
  ) {}
  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    input: {
      readonly host: string;
      readonly path: string;
      readonly domain: string;
      readonly ancestors: readonly string[];
    },
  ): Promise<boolean> {
    const publication = this.publication(input.host, input.domain);
    if (publication === null) return false;
    const document = this.documents.require(publication);
    if (input.path === SESSION_PATH) {
      this.session(request, response, { ...input, chat: document.view.chat_id, publication });
      return true;
    }
    const caller = this.reader(request, publication);
    await serveChatPage(
      { documents: this.documents },
      caller,
      { request, response },
      {
        chat: document.view.chat_id,
        publication,
        path: input.path,
        prefix: '',
        ancestors: input.ancestors,
      },
    );
    return true;
  }
  private credential(clientId: string, publication: string): string {
    const signature = createHmac('sha256', this.key).update(`${clientId}:${publication}`);
    return `${clientId}.${signature.digest('hex')}`;
  }
  private reader(request: IncomingMessage, publication: string): Caller {
    const cookie = pageCookie(request);
    const clientId = cookie?.split('.')[0] ?? '';
    const expected = Buffer.from(this.credential(clientId, publication));
    const given = Buffer.from(cookie ?? '');
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      throw new ApiError('unauthorized', 'Open this page again from your paired app.');
    return {
      kind: 'client',
      client: effectiveClient(
        this.store,
        this.store.clients.byId(clientId),
        accessEntryOf(request, false),
      ),
    };
  }
  private publication(host: string, domain: string): string | null {
    if (!host.endsWith(`.${domain}`)) return null;
    const id = host.slice(0, -domain.length - 1);
    if (!/^[0-9a-f]{32}$/u.test(id)) return null;
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  }
  private session(
    request: IncomingMessage,
    response: ServerResponse,
    input: {
      readonly ancestors: readonly string[];
      readonly chat: string;
      readonly publication: string;
    },
  ): void {
    const origin = request.headers.origin;
    if (origin === undefined || !input.ancestors.includes(origin))
      throw new ApiError('forbidden', 'Open this page from your paired app.');
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('vary', 'origin');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'authorization',
      });
      response.end();
      return;
    }
    if (request.method !== 'POST')
      throw new ApiError('method_not_allowed', 'Page sessions use POST.');
    const caller = authenticate(this.store, request, 'member', false);
    this.documents.visible(caller, input.chat, input.publication);
    if (caller.kind !== 'client')
      throw new ApiError('unauthorized', 'Pair this browser with the server.');
    response.writeHead(204, {
      'set-cookie': `${PAGE_COOKIE}=${this.credential(caller.client.id, input.publication)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`,
      'cache-control': 'no-store',
    });
    response.end();
  }
}
function pageCookie(request: IncomingMessage): string | null {
  const values = (request.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${PAGE_COOKIE}=`));
  return values.length === 1 ? (values[0]?.slice(PAGE_COOKIE.length + 1) ?? null) : null;
}
