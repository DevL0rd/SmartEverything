import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AiChatRow, AiHarnessHost } from '@smarteverything/domain';
import { listMachines } from '../../../src/harness/machines';
import { machineChangedNote } from '../../../src/harness/machine-note';
import { useRig, type Rig } from './support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

function windowsHost(sandbox?: AiHarnessHost['sandbox']): AiHarnessHost {
  return {
    target: { kind: 'device', device_id: randomUUID() },
    name: 'Laptop',
    online: true,
    platform: 'windows',
    ...(sandbox === undefined ? {} : { sandbox }),
    runtime_instance: randomUUID(),
    connection_generation: randomUUID(),
    manifest: null,
    unavailable_reason: null,
  };
}

async function openChat(): Promise<AiChatRow> {
  const chat = rig.newChat(rig.hub.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  await rig.service.directory.execute(rig.hub.target, randomUUID(), open);
  return rig.opened.store.aiChats.chat(chat.id);
}

describe('machine_read for a Windows computer', () => {
  it('names the system and the partial sandbox so the model knows reads are not confined', async () => {
    const chat = await openChat();
    const host = windowsHost('partial');
    rig.service.directory.register({
      actor: { kind: 'node', id: randomUUID() },
      host,
    });

    const { machines } = listMachines(rig.service, rig.owner, chat.id);

    expect(machines.find((machine) => machine.name === 'Laptop')).toStrictEqual({
      id: host.target.kind === 'device' ? host.target.device_id : '',
      name: 'Laptop',
      os: 'Windows',
      sandbox: 'partial',
      online: true,
      current: false,
    });
    expect(machines.filter((machine) => 'sandbox' in machine)).toHaveLength(1);
  });
});

describe('the note a chat gets when it moves machines', () => {
  const from = windowsHost();

  it('says that a partial sandbox confines writes only', () => {
    const note = machineChangedNote({ from, to: windowsHost('partial'), cwd: 'C:\\Users\\home' });

    expect(note).toBe(
      'Machine changed: you are now running on Laptop (Windows), folder C:\\Users\\home. Its sandbox confines writes only; reads are not confined. Previous machine: Laptop.',
    );
  });

  it('adds nothing about the sandbox when none is reported partial', () => {
    const note = machineChangedNote({ from, to: windowsHost(), cwd: 'C:\\Users\\home' });

    expect(note).toBe(
      'Machine changed: you are now running on Laptop (Windows), folder C:\\Users\\home. Previous machine: Laptop.',
    );
  });
});
