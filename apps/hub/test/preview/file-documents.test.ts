import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiHtmlPreviewPublication, HubPreviewFileClose } from '@smarteverything/domain';
import { PreviewFileDocuments } from '../../src/preview/file-documents';
import type { PreviewDocuments } from '../../src/preview/documents';
import { testLogger } from '../support/logs';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';

type Documents = ConstructorParameters<typeof PreviewFileDocuments>[1];

let rig: Rig;
let files: PreviewFileDocuments;
let validators: Map<string, () => void>;
let revoked: ((id: string) => void)[];
let closes: HubPreviewFileClose[];

beforeEach(async () => {
  rig = await harnessRig();
  validators = new Map();
  revoked = [];
  closes = [];
  const documents: Documents = {
    publishOwned: (profile, chat, input, source): AiHtmlPreviewPublication => {
      source.validate();
      const view: AiHtmlPreviewPublication = {
        kind: 'html',
        id: randomUUID(),
        revision: randomUUID(),
        chat_id: chat,
        profile_id: profile,
        title: input.title,
        initial_path: '/',
        expires_at: null,
      };
      validators.set(view.id, source.validate);
      return view;
    },
    require: (id): ReturnType<PreviewDocuments['require']> => {
      validators.get(id)?.();
      throw new Error('This test reads no HTML.');
    },
    revoke: (id): void => {
      for (const listener of revoked) listener(id);
    },
    revalidate: (): void => {
      for (const [id, validate] of validators) {
        try {
          validate();
        } catch (cause) {
          expect(cause).toBeInstanceOf(Error);
          for (const listener of revoked) listener(id);
        }
      }
    },
    onRevoke: (listener): (() => void) => {
      revoked.push(listener);
      return (): void => undefined;
    },
  };
  files = new PreviewFileDocuments(rig.service, documents, testLogger('files'));
});

afterEach(async () => {
  files.stop();
  await rig.close();
});

function connect(runtime?: string): { generation: string; runtime: string; device: string } {
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
    previewFileClose: (frame): void => {
      closes.push(frame);
    },
  });
  const device = rig.desk.target.kind === 'device' ? rig.desk.target.device_id : '';
  return { generation, runtime: instance, device };
}

function publish(connection: ReturnType<typeof connect>): AiHtmlPreviewPublication {
  const chat = rig.newChat(rig.desk.target);
  const open = rig.service.prepare(rig.owner, chat.id, rig.authority, rig.clientId);
  const view = files.native(
    {
      device_id: connection.device,
      generation: connection.generation,
      runtime_instance: connection.runtime,
    },
    {
      operation: 'preview_file_publish',
      claim: open.claim,
      workspace: '/home/test',
      file_path: '/home/test/index.html',
      title: 'Page',
      html: '<p>x</p>',
      watch_handle: randomUUID(),
    },
  );
  if (!('kind' in view)) throw new Error('Publishing did not return a preview.');
  return view;
}

describe('a file preview lives while its computer keeps running', () => {
  it('survives the computer reconnecting and closes its watch over the new connection', () => {
    const first = connect();
    const view = publish(first);
    const second = connect(first.runtime);
    expect(closes).toEqual([]);
    expect(() => validators.get(view.id)?.()).not.toThrow();
    for (const listener of revoked) listener(view.id);
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({
      generation: second.generation,
      runtime_instance: first.runtime,
    });
  });

  it('survives going offline for a while', () => {
    const view = publish(connect());
    rig.service.directory.offline(rig.desk.target);
    expect(() => validators.get(view.id)?.()).not.toThrow();
    expect(closes).toEqual([]);
  });

  it('ends when the computer restarts as another runtime', () => {
    const view = publish(connect());
    connect(randomUUID());
    expect(() => validators.get(view.id)?.()).toThrow('restarted');
    expect(closes).toHaveLength(1);
  });
});
