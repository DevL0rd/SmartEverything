import {
  DEFAULT_CODEX_AI_SETTINGS,
  type ComputerAiCapabilities,
  type ComputerAiReply,
  type ComputerAiStatus,
  type ComputerRuntimeCapabilities,
  type ComputerRuntimeModel,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputerAiDirectory } from '../../src/computers/ai-directory';
import type { ComputerAiHost, ComputerAiHostEvent } from '../../src/computers/ai-host';
import { unavailableRuntime } from '../../src/computers/runtime-status';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const CAPABILITIES: ComputerAiCapabilities = {
  runtime_version: '1.0.0',
  operations: ['models', 'status', 'configure'],
  settings: [],
  control_reason: null,
  provider_reason: null,
};

const TICKS_PER_MINUTE = 50 * 60;

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function computerId(): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:abc',
      parentId: null,
      kind: 'computer',
      name: 'Desk',
      model: 'smarteverything.computer',
      manufacturer: 'Linux',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

function fakeHost(deviceId: string): {
  readonly host: ComputerAiHost;
  readonly emit: (event: ComputerAiHostEvent) => void;
} {
  const listeners = new Set<(event: ComputerAiHostEvent) => void>();
  const host: ComputerAiHost = {
    read: (): Promise<ComputerAiReply> =>
      Promise.resolve({
        operation: 'models',
        value: [
          {
            device_id: deviceId,
            id: 'sonnet',
            resolved_model: null,
            name: 'Sonnet',
            description: '',
            efforts: [],
            adaptive_thinking: false,
            fast: false,
            available: true,
            reason: null,
          },
        ],
      }),
    execute: (): Promise<ComputerAiReply> => Promise.reject(new Error('unused')),
    onEvent: (listener) => {
      listeners.add(listener);
      listener({ kind: 'capabilities', capabilities: CAPABILITIES });
      return (): void => {
        listeners.delete(listener);
      };
    },
    stop: (): undefined => undefined,
  };
  return {
    host,
    emit: (event): void => {
      for (const listener of listeners) listener(event);
    },
  };
}

describe('computer AI status notices', () => {
  it('stays silent for a simulated minute of unchanged reads and capability reports', async () => {
    const deviceId = computerId();
    const directory = new ComputerAiDirectory(opened.store, testLogger('computers'));
    const sent: ComputerAiStatus[] = [];
    directory.onChange((status) => sent.push(status));
    const { host, emit } = fakeHost(deviceId);
    directory.attach(deviceId, host, false);
    opened.store.computerAi.saveSettings(deviceId, {
      control: { enabled: false, auto_link: false, mcp_areas: null },
      provider: { enabled: true, options: { builtin_tools: [] } },
    });
    directory.changed(deviceId);
    const settled = sent.length;

    for (let tick = 0; tick < TICKS_PER_MINUTE; tick += 1) {
      await directory.models(deviceId);
      emit({ kind: 'capabilities', capabilities: CAPABILITIES });
      directory.changed(deviceId);
    }

    expect(sent.length).toBe(settled);
    emit({ kind: 'capabilities', capabilities: { ...CAPABILITIES, runtime_version: '1.0.1' } });
    expect(sent.length).toBe(settled + 1);
  });
});

it('lists cached Codex models without a native read when the connected host cannot discover models', async () => {
  const target = { device_id: computerId(), runtime: 'codex' } as const;
  const reason = 'This Codex runtime requires an inspected protocol version.';
  const capabilities: ComputerRuntimeCapabilities = {
    ...unavailableRuntime('codex'),
    operations: ['status', 'configure'],
    provider_reason: reason,
  };
  const model: ComputerRuntimeModel = {
    ...target,
    id: 'test-model',
    resolved_model: null,
    name: 'Test model',
    description: '',
    efforts: [],
    adaptive_thinking: false,
    fast: false,
    input_modalities: [],
    available: true,
    reason: null,
  };
  opened.store.computerRuntimes.saveSettings(target, {
    runtime: 'codex',
    settings: {
      ...DEFAULT_CODEX_AI_SETTINGS,
      provider: { ...DEFAULT_CODEX_AI_SETTINGS.provider, enabled: true },
    },
  });
  opened.store.computerRuntimes.cache(target, capabilities, [model]);
  const directory = new ComputerAiDirectory(opened.store, testLogger('computers'));
  const read = vi.fn().mockRejectedValue(new Error('Unexpected native read'));
  directory.runtimes.attach(
    target,
    {
      runtime: 'codex',
      read,
      execute: vi.fn().mockRejectedValue(new Error('Unexpected native mutation')),
      onEvent: (listener) => {
        listener({ kind: 'capabilities', runtime: 'codex', capabilities });
        return (): void => undefined;
      },
      stop: (): void => undefined,
    },
    false,
  );

  await expect(directory.runtimeModels(target)).resolves.toEqual([
    { ...model, available: false, reason },
  ]);
  expect(read).not.toHaveBeenCalled();
});
