import { describe, expect, it } from 'vitest';
import type { AiHarnessHost } from '@smarteverything/domain';
import { harnessHostNote } from './harness-context';

function host(
  platform: AiHarnessHost['platform'],
  sandbox?: AiHarnessHost['sandbox'],
): AiHarnessHost {
  return {
    target: { kind: 'device', device_id: '2f6b1f2e-8f4c-4c53-9a54-0d8f5f6d3b11' },
    name: 'Desk',
    online: true,
    platform,
    ...(sandbox === undefined ? {} : { sandbox }),
    runtime_instance: '7d2d8e3b-4f7a-4a53-8f61-9b3b2f7f2c10',
    connection_generation: '0c9f6f0e-5a41-4b8a-9d4b-3f7a4f6c8a21',
    manifest: null,
    unavailable_reason: null,
  };
}

describe('the note shown beside a machine', () => {
  it('says Windows machines are not verified and that a partial sandbox confines writes only', () => {
    expect(harnessHostNote(host('windows', 'partial'))).toBe(
      'Not verified on Windows · writes are confined, reads are not',
    );
  });

  it('says only that Windows is not verified when the sandbox is not reported partial', () => {
    expect(harnessHostNote(host('windows'))).toBe('Not verified on Windows');
  });

  it.each(['linux', 'macos'] as const)('shows nothing for a %s machine', (platform) => {
    expect(harnessHostNote(host(platform))).toBeNull();
  });
});
