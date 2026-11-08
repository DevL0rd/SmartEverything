import { QueryClient } from '@tanstack/react-query';
import { COMPUTER_AI_STATUS, DEFAULT_COMPUTER_AI_SETTINGS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { COMPUTER_NOTICES } from './notices';

const DEVICE = '11111111-1111-4111-8111-111111111111';

function status(version: string): ReturnType<typeof COMPUTER_AI_STATUS.parse> {
  return COMPUTER_AI_STATUS.parse({
    device_id: DEVICE,
    local: true,
    online: true,
    settings: DEFAULT_COMPUTER_AI_SETTINGS,
    capabilities: {
      runtime_version: version,
      operations: [],
      settings: [],
      control_reason: null,
      provider_reason: null,
    },
  });
}

describe('computer AI status notices', () => {
  it('refetches nothing for an identical status and does for a changed one', () => {
    const client = new QueryClient();
    const context = { client, store: new EntityStore(), live: true };
    const invalidated: unknown[] = [];
    client.invalidateQueries = (filters): Promise<void> => {
      invalidated.push(filters?.queryKey);
      return Promise.resolve();
    };
    const receive = (version: string): void => {
      COMPUTER_NOTICES.receive({ type: 'computer_ai_status', status: status(version) }, context);
    };

    receive('1.0.0');
    const first = invalidated.length;
    for (let notice = 0; notice < 100; notice += 1) receive('1.0.0');
    expect(invalidated.length).toBe(first);
    receive('1.0.1');
    expect(invalidated.length).toBeGreaterThan(first);
  });
});
