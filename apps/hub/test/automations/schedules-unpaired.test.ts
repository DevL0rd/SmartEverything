import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { useRig } from './support/use-rig';

const rig = useRig({ fresh: true });

describe('a scheduled action outlives the phone that scheduled it', () => {
  it('runs as the saving profile after that phone was unpaired', async () => {
    const phone = await rig().member();
    const saved = await phone.request(API_ENDPOINTS.createSchedule, {
      body: {
        label: 'Lamp later',
        timing: { kind: 'in', seconds: 120 },
        steps: [
          {
            kind: 'tool',
            tool: 'device_control',
            args: {
              deviceIds: [rig().ids.lamp],
              capability: 'power',
              value: true,
            },
            stopOnFailure: false,
          },
        ],
      },
    });
    const clientId = saved.schedule.client_id;
    expect(clientId).not.toBeNull();
    await rig().request(API_ENDPOINTS.removeClient, { params: { clientId: clientId ?? '' } });
    rig().clock.advanceTo('2026-10-08T10:02:00.000Z');
    await rig().until(async () => {
      const rows = await rig().request(API_ENDPOINTS.listSchedules);
      return rows.find((row) => row.id === saved.schedule.id)?.state === 'done';
    });
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
  });
});
