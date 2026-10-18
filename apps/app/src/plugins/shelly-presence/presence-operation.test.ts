import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHELLY_ACTIONS, type ShellyAction } from '@smarteverything/shelly';
import { presenceFixture } from './presence-fixture';

const callPluginTool = vi.fn();
vi.mock('../../api/plugins', () => ({ callPluginTool }));

const { confirmation, performOperation } = await import('./use-presence-operation');
const { isDestructive, operatePresence } = await import('./presence-operation');

const SENSOR = presenceFixture();

beforeEach(() => {
  callPluginTool.mockReset();
});

describe('destructive operations', () => {
  it('flags exactly the delete and factory reset operations of the catalogue', () => {
    const destructive = SHELLY_ACTIONS.filter((action) => isDestructive(action));
    const expected: readonly ShellyAction[] = [
      'delete_zone',
      'schedule_delete',
      'schedule_delete_all',
      'webhook_delete',
      'webhook_delete_all',
      'script_delete',
      'kvs_delete',
      'virtual_delete',
      'bthome_delete_device',
      'bthome_delete_sensor',
      'ble_delete_client',
      'device_reset',
      'matter_reset',
    ];
    expect([...destructive].sort()).toStrictEqual([...expected].sort());
  });

  it('asks for confirmation once for a destructive row and never for a normal one', () => {
    expect(confirmation({ action: 'delete_zone', params: { id: 201 } })).toMatchObject({
      title: 'Delete zone?',
      tone: 'destructive',
    });
    expect(confirmation({ action: 'set_presence', params: { config: {} } })).toBeUndefined();
  });
});

describe('performOperation', () => {
  it('shows the parameters that fail the catalogue as readable field errors', async () => {
    const performed = await performOperation(SENSOR, { action: 'delete_zone', params: {} });
    expect(performed.saved).toBe(false);
    expect(performed.state.error).toContain('id');
    expect(performed.state.error).not.toContain('"issues"');
    expect(callPluginTool).not.toHaveBeenCalled();
  });

  it('sends the action to the operate tool without a revision for a partial settings write', async () => {
    callPluginTool.mockResolvedValue({
      outcome: 'done',
      result: {
        state: 'accepted',
        action: 'set_presence',
        result: null,
        restartRequired: false,
        revision: 7,
      },
    });
    const performed = await performOperation(SENSOR, {
      action: 'set_presence',
      params: { config: { enable: true } },
    });
    expect(performed.saved).toBe(true);
    expect(performed.state.message).toBe('Accepted by the device.');
    expect(callPluginTool).toHaveBeenCalledWith('shelly-presence', 'operate', {
      externalId: 'shelly-presence:radar-1',
      action: 'set_presence',
      params: { config: { enable: true } },
    });
  });

  it.each(['schedule_create', 'schedule_update', 'webhook_create', 'webhook_update'] as const)(
    'sends %s without a list revision so a list changed elsewhere never blocks the save',
    async (action) => {
      callPluginTool.mockResolvedValue({
        outcome: 'done',
        result: { state: 'accepted', action, result: null, restartRequired: false, revision: 9 },
      });
      await operatePresence(SENSOR, { action, params: { id: 1 } });
      expect(callPluginTool.mock.calls[0]?.[2]).not.toHaveProperty('expectedRevision');
    },
  );

  it('reports an unconfirmed write and a device refusal in plain text', async () => {
    callPluginTool.mockResolvedValueOnce({
      outcome: 'done',
      result: { state: 'unknown', action: 'set_presence', message: 'The sensor went offline.' },
    });
    const unknown = await performOperation(SENSOR, {
      action: 'set_presence',
      params: { config: {} },
    });
    expect(unknown).toMatchObject({ saved: false, state: { error: 'The sensor went offline.' } });
    callPluginTool.mockRejectedValueOnce(new Error('Shelly refused: -103 Invalid argument'));
    const refused = await performOperation(SENSOR, {
      action: 'set_presence',
      params: { config: {} },
    });
    expect(refused.state.error).toBe('Shelly refused: -103 Invalid argument');
  });
});
