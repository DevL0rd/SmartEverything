import { AsyncLocalStorage } from 'node:async_hooks';
import { createParser } from 'eventsource-parser';
import { z } from 'zod';
import { Logger, messageOf } from '@smarteverything/logging';
import { ApiError, WEB_SOURCE } from '@smarteverything/domain';
import type { WebSource } from '@smarteverything/domain';
import { OPENROUTER_WEB_SEARCH_TOOL } from './web-search';

const FRAME = z.looseObject({
  choices: z
    .array(
      z.looseObject({
        delta: z
          .looseObject({
            annotations: z
              .array(
                z.looseObject({
                  type: z.string(),
                  url_citation: z
                    .looseObject({
                      url: z.string().min(1),
                      title: z.string().nullable().optional(),
                    })
                    .optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const FRAME_TEXT = z
  .string()
  .transform((text, context): unknown => {
    try {
      return JSON.parse(text);
    } catch (cause) {
      context.addIssue({
        code: 'custom',
        message: `The search frame is not JSON: ${messageOf(cause)}.`,
      });
      return z.NEVER;
    }
  })
  .pipe(FRAME);

const log = new Logger('hub.assistant');

const REQUEST_BODY = z.looseObject({ tools: z.array(z.unknown()).optional() });

export class SearchCitations {
  private readonly decoder = new TextDecoder();
  private readonly found: WebSource[] = [];
  private readonly parser = createParser({
    onEvent: (event): void => {
      this.frame(event.data);
    },
  });

  sources(): readonly WebSource[] {
    return [...this.found];
  }

  response(response: Response): Response {
    if (!response.ok || response.body === null) return response;
    return new Response(
      response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform: (bytes, controller): void => {
            this.parser.feed(this.decoder.decode(bytes, { stream: true }));
            controller.enqueue(bytes);
          },
          flush: (): void => {
            this.parser.feed(this.decoder.decode());
            this.parser.reset({ consume: true });
          },
        }),
      ),
      { status: response.status, statusText: response.statusText, headers: response.headers },
    );
  }

  private frame(data: string): void {
    if (data === '[DONE]') return;
    const parsed = FRAME_TEXT.safeParse(data);
    if (!parsed.success) {
      log.warn('web_search.frame_invalid', { issues: parsed.error.issues.length });
      return;
    }
    this.found.push(...citationsOf(parsed.data));
  }
}

function citationsOf(frame: z.infer<typeof FRAME>): readonly WebSource[] {
  return (frame.choices ?? [])
    .flatMap((choice) => choice.delta?.annotations ?? [])
    .flatMap(({ type, url_citation: source }) => {
      if (type !== 'url_citation' || source === undefined) return [];
      const cited = WEB_SOURCE.safeParse({ url: source.url, title: source.title ?? '' });
      return cited.success ? [cited.data] : [];
    });
}

const scope = new AsyncLocalStorage<SearchCitations>();

export function withSearchCitations<T>(
  citations: SearchCitations,
  work: () => Promise<T>,
): Promise<T> {
  return scope.run(citations, work);
}

function groundedInit(init: RequestInit | undefined): RequestInit {
  const body = init?.body;
  if (typeof body !== 'string')
    throw new ApiError('upstream_failed', 'The search request has no readable body.');
  const request = REQUEST_BODY.parse(JSON.parse(body));
  return {
    ...init,
    body: JSON.stringify({
      ...request,
      tools: [...(request.tools ?? []), OPENROUTER_WEB_SEARCH_TOOL],
    }),
  };
}

export function groundedFetch(fetcher: typeof fetch): typeof fetch {
  return async (input, init): Promise<Response> => {
    const citations = scope.getStore();
    if (citations === undefined) return fetcher(input, init);
    return citations.response(await fetcher(input, groundedInit(init)));
  };
}
