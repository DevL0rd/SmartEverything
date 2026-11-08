import { describe, expect, it } from 'vitest';
import type { ToolCaller } from '../../../src/ai-tools/hub-tool';
import type { OutFile } from '../../../src/plugins/builtin/discord/outgoing';
import {
  sendTool,
  type RunFileReader,
  type SendServices,
} from '../../../src/plugins/builtin/discord/tools/send-tool';
import { CHANNEL, OWNER_CALLER } from './fakes';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface Sent {
  readonly channelId: string | undefined;
  readonly files: readonly OutFile[];
}

const NO_READER: RunFileReader = () => Promise.reject(new Error('this reader must not be used'));

function services(
  readers: { uploadFile?: RunFileReader; pictureFile?: RunFileReader },
  maxBytes = 1_000_000,
): { readonly services: SendServices; readonly sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    services: {
      settings: { media_max_file_bytes: maxBytes },
      identity: { assertReady: () => undefined },
      authority: { access: () => Promise.resolve({ origin: null }) },
      directory: { resolve: (value) => Promise.resolve(value) },
      sender: {
        send: (input): Promise<unknown> => {
          sent.push({ channelId: input.channelId, files: input.files });
          return Promise.resolve({ id: '1' });
        },
      },
      media: { assertEnabled: () => undefined },
      download: () => Promise.reject(new Error('no downloads in this test')),
      machineFile: () => Promise.resolve(null),
      uploadFile: NO_READER,
      pictureFile: NO_READER,
      ...readers,
    },
  };
}

function picturesOf(owner: string, id: string, data: Buffer): RunFileReader {
  return (caller: ToolCaller, asked) =>
    Promise.resolve(
      asked === id && caller.profileId === owner ? { data, name: `snapshot-${id}.jpg` } : null,
    );
}

async function run(
  world: ReturnType<typeof services>,
  args: Readonly<Record<string, unknown>>,
  caller: ToolCaller = OWNER_CALLER,
): Promise<string> {
  const result = await sendTool(world.services).run({ channelId: CHANNEL, ...args }, caller);
  return JSON.stringify(result.response);
}

describe('sending a picture or attachment by its id', () => {
  it('posts the picture of a run, found by its id inside the hub, with its real image type', async () => {
    const world = services({ pictureFile: picturesOf('profile', 'abc', PNG) });
    const answer = await run(world, { picture: 'abc' });
    expect(answer).not.toContain('error');
    expect(world.sent).toHaveLength(1);
    expect(world.sent[0]?.channelId).toBe(CHANNEL);
    expect(world.sent[0]?.files).toEqual([
      { data: PNG, name: 'snapshot-abc.jpg', contentType: 'image/png' },
    ]);
  });

  it('posts several pictures by their ids together with a single one', async () => {
    const pictures: RunFileReader = (_caller, asked) =>
      Promise.resolve({ data: PNG, name: `snapshot-${asked}.jpg` });
    const world = services({ pictureFile: pictures });
    await run(world, { picture: 'a', pictures: ['b', 'c'] });
    expect(world.sent[0]?.files.map((file) => file.name)).toEqual([
      'snapshot-a.jpg',
      'snapshot-b.jpg',
      'snapshot-c.jpg',
    ]);
  });

  it('posts a chat attachment by its id through the attachment reader, not the picture reader', async () => {
    const world = services({
      uploadFile: picturesOf('profile', 'up-1', Buffer.from('notes')),
      pictureFile: () => Promise.reject(new Error('the picture reader must not be used')),
    });
    await run(world, { files: [{ attachment: 'up-1' }] });
    expect(world.sent[0]?.files.map((file) => file.name)).toEqual(['snapshot-up-1.jpg']);
  });

  it('mixes picture ids with the existing file sources in one message', async () => {
    const world = services({ pictureFile: picturesOf('profile', 'abc', PNG) });
    await run(world, { picture: 'abc', files: [{ name: 'log.txt', text: 'ok' }] });
    expect(world.sent[0]?.files.map((file) => file.name)).toEqual(['log.txt', 'snapshot-abc.jpg']);
  });

  it('refuses an id that does not exist or belongs to someone else, and sends nothing', async () => {
    const world = services({ pictureFile: picturesOf('someone-else', 'abc', PNG) });
    expect(await run(world, { picture: 'abc' })).toContain(
      'The picture abc does not exist or is not yours',
    );
    expect(world.sent).toEqual([]);
  });

  it('reports a reader failure with its reason and respects the file size setting', async () => {
    const failing = services({ pictureFile: () => Promise.reject(new Error('disk gone')) });
    expect(await run(failing, { picture: 'abc' })).toContain(
      'Could not read the picture abc: disk gone',
    );
    const small = services({ pictureFile: picturesOf('profile', 'abc', PNG) }, 10);
    expect(await run(small, { picture: 'abc' })).toContain('is larger than the');
    expect(small.sent).toEqual([]);
  });

  it('keeps refusing ids mixed with unknown keys, so no path can be typed through them', async () => {
    const world = services({ pictureFile: picturesOf('profile', 'abc', PNG) });
    expect(await run(world, { files: [{ attachment: 'abc', path: '/etc/passwd' }] })).toContain(
      'not valid',
    );
    expect(world.sent).toEqual([]);
  });
});
