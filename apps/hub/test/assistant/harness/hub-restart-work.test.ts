import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiHarnessTarget } from '@smarteverything/domain';
import { HarnessService } from '../../../src/harness/service';
import { systemClock } from '../../../src/clock';
import { hubLayout } from '../../../src/data-layout';
import { captureLogs } from '../../support/logs';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

async function waitingChat(target: AiHarnessTarget): Promise<string> {
  const chat = rig.newChat(target);
  const open = await rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(target, randomUUID(), open);
  const session = rig.service.state(rig.owner, chat.id);
  rig.opened.store.harnessSessions.project(
    {
      ...session,
      state: 'waiting',
      work: [
        { kind: 'delivery', id: session.session_id, reason: 'Native messages remain queued.' },
      ],
    },
    1_000,
  );
  return chat.id;
}

function restartHub(): void {
  new HarnessService(rig.opened.store, rig.service.routes, () => undefined, {
    layout: hubLayout(rig.opened.directory, {}),
    clock: systemClock,
  });
}

describe('a hub that restarts while a chat on the hub is working', () => {
  it('settles that chat as idle and leaves chats on other computers to their own runtime', async () => {
    const logs = captureLogs();
    const onHub = await waitingChat(rig.hub.target);
    const onDesk = await waitingChat(rig.desk.target);

    restartHub();

    expect(rig.service.state(rig.owner, onHub)).toMatchObject({ state: 'idle', work: [] });
    expect(rig.service.state(rig.owner, onDesk)).toMatchObject({ state: 'waiting' });
    expect(
      logs.records.filter((record) => record.event === 'harness.work_interrupted'),
    ).toHaveLength(1);
  });
});
