import { randomUUID } from 'node:crypto';
import {
  DEFAULT_CODEX_AI_SETTINGS,
  type ComputerRuntimeCapabilities,
} from '@smarteverything/domain';
import { expect, it, vi } from 'vitest';
import { createCodexHost } from '../../src/codex/host';
import type { CodexNativeOptions } from '../../src/codex/native';
import { testLogger } from '../support/logs';
import { hubCodexSites } from '../../src/codex/sites';
import { hubLayout } from '../../src/data-layout';

vi.mock('../../src/codex/native', () => ({
  CodexNative: class {
    constructor(private readonly options: CodexNativeOptions) {}

    configure = vi.fn();
    connect = (): Promise<void> => {
      this.options.changed(null);
      return Promise.resolve();
    };
    stop = vi.fn();
  },
}));

vi.mock('../../src/codex/provider', () => ({
  CodexProvider: class {
    configure = vi.fn();
    models = vi.fn().mockRejectedValue(new Error('Provider is unavailable.'));
    modalities = (): readonly string[] => [];
    stop = vi.fn();
  },
}));

it('advertises Codex models only when the configured discovery source is ready', async () => {
  const host = createCodexHost({
    deviceId: randomUUID(),
    sites: hubCodexSites(hubLayout('/unused', {})),
    log: testLogger('codex-models'),
  });
  const reported: ComputerRuntimeCapabilities[] = [];
  const unsubscribe = host.onEvent((event) => {
    if (event.kind === 'capabilities') reported.push(event.capabilities);
  });
  const control = { ...DEFAULT_CODEX_AI_SETTINGS.control, enabled: true };
  const provider = DEFAULT_CODEX_AI_SETTINGS.provider;
  try {
    await host.execute({
      runtime: 'codex',
      request: { operation: 'configure', settings: { control, provider } },
    });
    expect(reported.at(-1)?.operations).toContain('models');

    await host.execute({
      runtime: 'codex',
      request: {
        operation: 'configure',
        settings: { control, provider: { ...provider, enabled: true } },
      },
    });
    expect(reported.at(-1)).toMatchObject({
      control_reason: null,
      provider_reason: 'Provider is unavailable.',
    });
    expect(reported.at(-1)?.operations).not.toContain('models');
    expect(reported.at(-1)?.operations).toContain('provider_start');
  } finally {
    unsubscribe();
    host.stop();
  }
});
