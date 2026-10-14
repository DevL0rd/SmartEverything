import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, CLAUDE_SESSION_ID } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import { FLOOR_INPUT, HOOK_INPUT, MOD_REPORT, OBSERVED_INPUT } from '../../claude/hook-events';
import type { LinkPlane } from '../../claude/link-plane';
import { LINK_PATHS } from '../../claude/link-paths';
import { bearerOf, parseJsonBody, readBody, remoteOf, sendJson } from '../http';
import type { RawRoute } from '../http-server';

const BODY_LIMIT = 4 * 1024 * 1024;

const HEARTBEAT_MS = 25_000;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export interface LinkRoutesOptions {
  readonly plane: LinkPlane;
  readonly log: Logger;
}

function authorize(options: LinkRoutesOptions, request: IncomingMessage): void {
  if (!LOOPBACK.has(remoteOf(request))) {
    throw new ApiError('forbidden', 'The SmartEverything link only speaks to this computer.');
  }
  if (!options.plane.token.verify(bearerOf(request))) {
    throw new ApiError('unauthorized', 'Send the SmartEverything link token as a bearer token.');
  }
}

function closing(response: ServerResponse): AbortSignal {
  const controller = new AbortController();
  response.once('close', () => {
    controller.abort();
  });
  return controller.signal;
}

async function bodyOf(request: IncomingMessage): Promise<unknown> {
  return parseJsonBody(request, await readBody(request, BODY_LIMIT));
}

function jsonRoute<T>(
  options: LinkRoutesOptions,
  route: {
    readonly path: string;
    readonly schema: z.ZodType<T>;
    readonly problem: string;
    readonly run: (input: T, closed: AbortSignal) => unknown;
  },
): RawRoute {
  return {
    method: 'POST',
    path: route.path,
    handle: async (request, response): Promise<void> => {
      authorize(options, request);
      const parsed = route.schema.safeParse(await bodyOf(request));
      if (!parsed.success) {
        throw new ApiError('invalid_request', route.problem);
      }
      const output = await route.run(parsed.data, closing(response));
      if (!response.destroyed) {
        sendJson(response, 200, output);
      }
    },
  };
}

function streamRoute(options: LinkRoutesOptions): RawRoute {
  return {
    method: 'GET',
    path: LINK_PATHS.stream,
    handle: (request, response): Promise<void> => {
      authorize(options, request);
      const poll = new URL(request.url ?? '/', 'http://server').searchParams.get('poll') === '1';
      const session = CLAUDE_SESSION_ID.safeParse(
        new URL(request.url ?? '/', 'http://server').searchParams.get('session'),
      );
      if (!session.success) {
        throw new ApiError('invalid_request', 'Open the stream with ?session=<session id>.');
      }
      response.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      });
      response.flushHeaders();
      const heartbeat = setInterval(() => {
        if (poll) response.end();
        else response.write('\n');
      }, HEARTBEAT_MS);
      const signal = closing(response);
      signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
      });
      options.plane.attachStream(
        session.data,
        {
          write: (line) => {
            if (poll) response.end(line);
            else response.write(line);
          },
          close: () => {
            response.end();
          },
        },
        signal,
        poll,
      );
      return Promise.resolve();
    },
  };
}

export function claudeLinkRoutes(options: LinkRoutesOptions): readonly RawRoute[] {
  const { plane } = options;
  return [
    jsonRoute(options, {
      path: LINK_PATHS.hooks,
      schema: HOOK_INPUT,
      problem: 'The hook event is not one the link handles.',
      run: (input, closed) => plane.hook(input, closed),
    }),
    jsonRoute(options, {
      path: LINK_PATHS.observed,
      schema: OBSERVED_INPUT,
      problem: 'The observed hook event is not one the link handles.',
      run: (input) => {
        plane.observed(input);
        return {};
      },
    }),
    jsonRoute(options, {
      path: LINK_PATHS.floor,
      schema: FLOOR_INPUT,
      problem: 'The controller floor check needs a PreToolUse event.',
      run: (input) => plane.floor(input),
    }),
    jsonRoute(options, {
      path: LINK_PATHS.reports,
      schema: MOD_REPORT,
      problem: 'The report is not one the link handles.',
      run: (report) => {
        plane.report(report);
        return { ok: true };
      },
    }),
    streamRoute(options),
  ];
}
