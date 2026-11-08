import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server';
import type {
  MockLlmBehavior,
  MockLlmServer,
  MockLlmServerOptions,
} from '@deepseek-ai/dsh-llm-mock-server';

export const DEEPSEEK_KEY_REFERENCE = 'DEEPSEEK_API_KEY';
export const DEEPSEEK_PROVIDER = 'deepseek-official';
export const DEEPSEEK_MODEL = 'deepseek-flash';

export interface MockProvider {
  readonly server: MockLlmServer;
  readonly dispose: () => Promise<void>;
}

export async function startMockProvider(
  sequence: readonly MockLlmBehavior[],
  options: Omit<MockLlmServerOptions, 'sequence'> = {},
): Promise<MockProvider> {
  const home = await mkdtemp(join(tmpdir(), 'harness-deepseek-'));
  const server = await startMockLlmServer({ ...options, sequence });
  vi.stubEnv('DEEPSEEK_BASE_URL', `${server.baseURL}/v1`);
  vi.stubEnv('DSH_HOME', home);
  return {
    server,
    dispose: async (): Promise<void> => {
      vi.unstubAllEnvs();
      await server.close();
      await rm(home, { recursive: true, force: true });
    },
  };
}
