import { QueryClient } from '@tanstack/react-query';
import {
  AI_HARNESS_CAPABILITY,
  AI_HARNESS_PROTOCOL_VERSION,
  DEFAULT_AI_HARNESS_PERMISSION,
} from '@smarteverything/domain';
import { expect, it, vi } from 'vitest';
import { ApiClient, UnreadableAnswerError } from '../../../api/connection/client';
import { api } from '../../../api/transport';
import { harnessCatalogueQuery } from './harness';

vi.mock('../../../api/transport', () => ({ api: vi.fn() }));

const FEATURES = ['text', 'subagent-send', 'subagent-resume', 'subagent-attachments'];

function reply(features: readonly string[]): Response {
  return Response.json({
    capability: AI_HARNESS_CAPABILITY,
    hosts: [
      {
        target: { kind: 'server' },
        name: 'Home Hub',
        online: true,
        runtime_instance: '00000000-0000-4000-8000-000000000001',
        connection_generation: '00000000-0000-4000-8000-000000000002',
        manifest: {
          protocol: AI_HARNESS_PROTOCOL_VERSION,
          revision: 'test',
          features,
          tools: [],
          permissions: [DEFAULT_AI_HARNESS_PERMISSION],
        },
        platform: 'linux',
        unavailable_reason: null,
      },
    ],
    routes: [],
  });
}

function queryClient(fetcher: typeof fetch): QueryClient {
  vi.mocked(api).mockReturnValue(
    new ApiClient({
      baseUrl: 'https://home.example.com',
      token: null,
      fetch: fetcher,
      onUnauthorized: (): void => undefined,
    }),
  );
  return new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
}

it('reads native helper capabilities from the chat catalogue', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(reply(FEATURES)));
  const catalogue = await queryClient(fetcher).query(harnessCatalogueQuery());

  expect(catalogue.hosts[0]?.manifest?.features).toEqual(FEATURES);
  expect(fetcher).toHaveBeenCalledOnce();
});

it('rejects an unknown manifest feature without fetching the same invalid answer again', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(() => Promise.resolve(reply([...FEATURES, 'unknown-feature'])));
  const catalogue = queryClient(fetcher).query(harnessCatalogueQuery());
  const issue: unknown = expect.stringContaining('hosts.0.manifest.features.4');

  await expect(catalogue).rejects.toBeInstanceOf(UnreadableAnswerError);
  await expect(catalogue).rejects.toMatchObject({
    message: 'Check for a SmartEverything update, then try again.',
    route: 'GET /api/ai/harness',
    issues: issue,
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

it('recovers when the next catalogue request succeeds after a network failure', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockImplementation(() => Promise.resolve(reply(FEATURES)));
  const catalogue = await queryClient(fetcher).query(harnessCatalogueQuery());

  expect(catalogue.hosts[0]?.manifest?.features).toEqual(FEATURES);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
