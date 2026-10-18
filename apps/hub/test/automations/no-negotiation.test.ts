import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, verifiedPublicUrl } from '../support/booted';
import { openLive } from '../support/server';
import { createAutomation, nodeId, setPower, type Steps } from './support/programs';
import { useRig } from './support/use-rig';

const rig = useRig({ fresh: true });

function dimFor(deviceId: string): Steps {
  return [
    {
      type: 'temporary_effect',
      nodeId: nodeId(),
      target: { kind: 'devices', deviceIds: [deviceId] },
      capability: 'brightness',
      operation: { type: 'set', value: 20 },
      durationMs: 60_000,
      priority: 0,
    },
  ];
}

async function plainFetch(path: string): Promise<Response> {
  return fetch(`${rig().booted.base}${path}`, {
    headers: { authorization: `Bearer ${rig().booted.owner}` },
  });
}

describe('one wire format for every client', () => {
  it('lists and snapshots an automation with a temporary change and one with a speech trigger for a client that sends no Accept header', async () => {
    const effect = await createAutomation(rig(), 'Movie mode', { actions: dimFor(rig().ids.lamp) });
    const speech = await createAutomation(rig(), 'Say lights', {
      triggers: [
        {
          type: 'speech',
          phrase: 'lights',
          caseSensitive: false,
          includeBots: false,
          source: null,
        },
      ],
      actions: [setPower(rig().ids.lamp, true)],
    });
    const listed = await (await plainFetch('/api/automations')).json();
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: effect.id }),
        expect.objectContaining({ id: speech.id }),
      ]),
    );
    const snapshot = await rig().request(API_ENDPOINTS.readSnapshot);
    expect(snapshot.tables.automations.map((row) => row.id)).toEqual(
      expect.arrayContaining([effect.id, speech.id]),
    );
  });

  it('streams group changes to a live subscription that declares no capability', async () => {
    const live = await openLive(rig().booted.base, rig().booted.owner);
    live.socket.send(
      JSON.stringify({
        type: 'subscribe',
        tables: ['device_groups', 'automation_runs'],
        streams: ['assistant'],
      }),
    );
    expect(await live.next((message) => message.type === 'subscribed')).toMatchObject({
      tables: ['device_groups', 'automation_runs'],
    });
    const group = await rig().request(API_ENDPOINTS.createDeviceGroup, {
      body: { name: 'Lamps', device_ids: [rig().ids.lamp, rig().ids.lampTwo] },
    });
    expect(
      await live.next((message) => message.type === 'change' && message.table === 'device_groups'),
    ).toMatchObject({ operation: 'INSERT', record: { id: group.id } });
    live.socket.close();
  });

  it('streams the same group changes to a member connection', async () => {
    await verifiedPublicUrl(rig().booted);
    const member = await pairPhone(rig().booted, 'member');
    const live = await openLive(rig().booted.base, member.token);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['device_groups'], streams: [] }));
    await live.next((message) => message.type === 'subscribed');
    const group = await rig().request(API_ENDPOINTS.createDeviceGroup, {
      body: { name: 'Member lamps', device_ids: [rig().ids.lamp, rig().ids.lampTwo] },
    });
    expect(
      await live.next((message) => message.type === 'change' && message.table === 'device_groups'),
    ).toMatchObject({ operation: 'INSERT', record: { id: group.id } });
    live.socket.close();
  });

  it('advertises no feature list on any response', async () => {
    const response = await plainFetch('/api/session');
    expect(response.headers.get('x-smarteverything-ai-capabilities')).toBeNull();
    expect(response.headers.get('x-smarteverything-ai-unavailable')).toBeNull();
  });
});
