import { describe, expect, it } from 'vitest';
import { AI_HARNESS_HOST, type AiHarnessHost } from '@smarteverything/domain';
import { claudeLine, runtimeLine } from './computer-overview';

const MANIFEST = {
  protocol: 1,
  revision: 'r1',
  composition: {
    dsh_version: '1',
    runtime_version: '1',
    session_format: 1,
    preset: 'default',
    fingerprint: 'f',
    event_vocabulary: [],
  },
  features: [],
  tools: [],
  permissions: [{ sandbox: 'read-only', approval: 'on-request' }],
};

function host(change: {
  readonly online?: boolean;
  readonly defaultDirectory?: string;
}): AiHarnessHost {
  return AI_HARNESS_HOST.parse({
    target: { kind: 'device', device_id: '11111111-1111-4111-8111-111111111111' },
    name: 'Workstation',
    online: change.online ?? true,
    runtime_instance: '22222222-2222-4222-8222-222222222222',
    connection_generation: '33333333-3333-4333-8333-333333333333',
    manifest: MANIFEST,
    workspace: {
      home_directory: '/home/dana',
      default_directory: change.defaultDirectory ?? null,
      available: true,
      reason: null,
    },
    unavailable_reason: null,
    platform: 'linux',
  });
}

describe('runtimeLine', () => {
  it('waits for the catalogue, then says Not reachable for a missing machine', () => {
    expect(runtimeLine(undefined)).toBeUndefined();
    expect(runtimeLine(null)).toBe('Not reachable');
  });

  it('says where new chats start when the machine is ready', () => {
    expect(runtimeLine(host({}))).toBe('Ready · new chats start in /home/dana');
    expect(runtimeLine(host({ defaultDirectory: '/home/dana/repo' }))).toBe(
      'Ready · new chats start in /home/dana/repo',
    );
  });

  it('gives the reason when the machine is offline', () => {
    expect(runtimeLine(host({ online: false }))).toBe('This machine is offline.');
  });
});

describe('claudeLine', () => {
  it('counts the models Claude supplies, or says Off', () => {
    expect(claudeLine(undefined, undefined)).toBeUndefined();
    expect(claudeLine(false, 4)).toBe('Off');
    expect(claudeLine(true, 4)).toBe('Supplying 4 models');
    expect(claudeLine(true, 1)).toBe('Supplying 1 model');
    expect(claudeLine(true, undefined)).toBe('Supplying models');
  });
});
