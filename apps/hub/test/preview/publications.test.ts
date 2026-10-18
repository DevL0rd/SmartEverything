import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiPreviewNotice, HubPreviewOpen } from '@smarteverything/domain';
import { PreviewPublications } from '../../src/preview/publications';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
let publications: PreviewPublications;
let notices: AiPreviewNotice[];
let sent: string[];

beforeEach(async () => {
  rig = await harnessRig();
  notices = [];
  sent = [];
  publications = new PreviewPublications(rig.service, (notice) => {
    notices.push(notice);
  });
});

afterEach(async () => {
  publications.stop();
  await rig.close();
});

function connect(label: string, runtime?: string): { generation: string; runtime: string } {
  const base = rig.service.directory.registered(rig.desk.target);
  const generation = randomUUID();
  const instance = runtime ?? base.host.runtime_instance;
  rig.service.directory.register({
    ...base,
    host: {
      ...base.host,
      online: true,
      connection_generation: generation,
      runtime_instance: instance,
    },
    preview: (frame: HubPreviewOpen): void => {
      sent.push(`${label}:${frame.stream_id}`);
    },
  });
  return { generation, runtime: instance };
}

function share(binding: { generation: string; runtime: string }, workspace = '/home/test'): string {
  const chat = rig.newChat(rig.desk.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const view = publications.native(
    {
      device_id: rig.desk.target.kind === 'device' ? rig.desk.target.device_id : '',
      generation: binding.generation,
      runtime_instance: binding.runtime,
    },
    {
      operation: 'preview_publish',
      claim: open.claim,
      workspace,
      service: {
        title: 'App',
        origin: 'http://127.0.0.1:5173',
        initial_path: '/',
        service_scope: 'authorized_workspace_service',
      },
      service_handle: randomUUID(),
    },
  );
  if (!('id' in view)) throw new Error('Sharing did not return a publication.');
  return view.id;
}

function open(id: string): void {
  publications.require(id).send({
    type: 'preview_open',
    device_id: randomUUID(),
    generation: randomUUID(),
    runtime_instance: randomUUID(),
    stream_id: id,
    ticket: 'a'.repeat(64),
    publication_id: id,
    revision: randomUUID(),
    service_handle: randomUUID(),
    expires_at: new Date(Date.now() + 1000).toISOString(),
  });
}

describe('a shared service lives while its computer is paired', () => {
  it('survives the computer reconnecting and streams over the new connection', () => {
    const first = connect('first');
    const id = share(first);
    open(id);
    const second = connect('second', first.runtime);
    expect(publications.require(id).view.generation).toBe(second.generation);
    open(id);
    expect(sent).toEqual([`first:${id}`, `second:${id}`]);
    expect(notices.at(-1)).toMatchObject({ state: 'published', publication_id: id });
  });

  it('ends when the computer comes back as a different runtime', () => {
    const id = share(connect('first'));
    connect('second', randomUUID());
    expect(() => publications.require(id)).toThrow('Sharing was revoked');
    expect(notices.at(-1)).toMatchObject({ state: 'revoked', publication_id: id });
  });

  it('stays shared while the computer is offline and reports it when streaming', () => {
    const id = share(connect('first'));
    rig.service.directory.offline(rig.desk.target);
    expect(() => publications.require(id)).not.toThrow();
    expect(() => {
      open(id);
    }).toThrow('unavailable');
  });

  it('admits only the workspace the session is admitted in', () => {
    const first = connect('first');
    expect(() => share(first, '/home/other')).toThrow('Sharing requires the workspace');
  });
});
