import { createServer, type Server } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { claudeLinkRoutes } from '../server/handlers/claude-link';
import type { LinkPlane } from './link-plane';
import { isMissing } from '../fs-util';

export interface ClaudeLoopback {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new ClaudeLoopbackError('The loopback listener has no TCP address.'));
      } else resolve(address.port);
    });
  });
}

export async function startClaudeLoopback(options: {
  readonly plane: LinkPlane;
  readonly directory: string;
  readonly log: Logger;
}): Promise<ClaudeLoopback> {
  const routes = claudeLinkRoutes(options);
  const server = createServer((request, response) => {
    const route = routes.find(
      (candidate) =>
        candidate.method === request.method &&
        candidate.path === new URL(request.url ?? '/', 'http://localhost').pathname,
    );
    if (route === undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    void route.handle(request, response, {}).catch((cause: unknown) => {
      options.log.error('loopback.request_failed', cause);
      if (!response.headersSent) response.writeHead(cause instanceof ApiError ? 403 : 500);
      response.end();
    });
  });
  const url = `http://127.0.0.1:${String(await listen(server))}`;
  await mkdir(options.directory, { recursive: true, mode: 0o700 });
  const file = join(options.directory, 'link-endpoint.json');
  await writeFile(file, JSON.stringify({ url }), { mode: 0o600 });
  return {
    url,
    stop: async (): Promise<void> => {
      options.plane.stop();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((cause) => {
          if (cause === undefined) resolve();
          else reject(cause);
        }),
      );
      const known = await readFile(file, 'utf8').catch((cause: unknown) => {
        if (isMissing(cause)) return null;
        throw cause;
      });
      if (known === JSON.stringify({ url })) await rm(file, { force: true });
    },
  };
}
class ClaudeLoopbackError extends Error {
  override readonly name = 'ClaudeLoopbackError';
}
