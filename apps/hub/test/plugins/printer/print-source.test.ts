import { describe, expect, it } from 'vitest';
import { loadSource, type PrintPorts } from '../../../src/plugins/builtin/printer/print';
import { OWNER } from './service-rig';

const PDF = Buffer.from('%PDF-1.4 a');
const OTHER_PDF = Buffer.from('%PDF-1.4 b');

function portsWith(
  files: Readonly<Record<string, Buffer>>,
  pictures: Readonly<Record<string, Buffer>> = {},
): PrintPorts {
  return {
    converter: {
      pdfToRaster: () => Promise.reject(new Error('unused')),
      imageToRaster: () => Promise.reject(new Error('unused')),
      imageToJpeg: () => Promise.reject(new Error('unused')),
    },
    files: {
      fromUpload: () => Promise.resolve(null),
      fromPicture: (_caller, id): Promise<{ data: Buffer; name: string } | null> => {
        const data = pictures[id];
        return Promise.resolve(data === undefined ? null : { data, name: `picture-${id}` });
      },
      fromMachine: () => Promise.resolve(null),
      attachmentsOf: () => Object.keys(files),
      readAttachment: (path) => Promise.resolve(files[path] ?? Buffer.alloc(0)),
    },
  };
}

const IN_CHAT = { ...OWNER, chatId: 'chat-1' };

describe('printing a chat attachment', () => {
  it('prints the file with exactly that name, not one that ends the same way', async () => {
    const ports = portsWith({
      '/files/a/data.pdf': OTHER_PDF,
      '/files/b/a.pdf': PDF,
    });
    const loaded = await loadSource(ports, IN_CHAT, { kind: 'attachment', name: 'a.pdf' });
    expect(Buffer.from(loaded.data).toString()).toBe('%PDF-1.4 a');
    expect(loaded.name).toBe('a.pdf');
  });

  it('does not take any file whose name merely ends with the given text', async () => {
    const ports = portsWith({ '/files/a/data.pdf': OTHER_PDF });
    await expect(
      loadSource(ports, IN_CHAT, { kind: 'attachment', name: 'pdf' }),
    ).rejects.toMatchObject({ reason: 'not_authorized' });
    await expect(
      loadSource(ports, IN_CHAT, { kind: 'attachment', name: 'a.pdf' }),
    ).rejects.toMatchObject({ reason: 'not_authorized' });
  });

  it('refuses when two attachments have the same name', async () => {
    const ports = portsWith({ '/files/a/a.pdf': PDF, '/files/b/a.pdf': OTHER_PDF });
    await expect(
      loadSource(ports, IN_CHAT, { kind: 'attachment', name: 'a.pdf' }),
    ).rejects.toMatchObject({ reason: 'ambiguous_file', fields: { matches: 2 } });
  });

  it('needs a chat to take an attachment from', async () => {
    await expect(
      loadSource(portsWith({}), OWNER, { kind: 'attachment', name: 'a.pdf' }),
    ).rejects.toMatchObject({ reason: 'not_authorized' });
  });
});

describe('printing a picture made in an automation run', () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

  it('loads the picture by its id with no chat and no file name', async () => {
    const loaded = await loadSource(portsWith({}, { snap1: JPEG }), OWNER, {
      kind: 'picture',
      pictureId: 'snap1',
    });
    expect(loaded).toMatchObject({ kind: 'jpeg', name: 'picture-snap1' });
    expect(Buffer.from(loaded.data)).toEqual(JPEG);
  });

  it('refuses a picture that does not exist or is not the caller’s', async () => {
    await expect(
      loadSource(portsWith({}), OWNER, { kind: 'picture', pictureId: 'missing' }),
    ).rejects.toMatchObject({ reason: 'not_authorized' });
  });

  it('refuses a picture that is not an image the printer can take', async () => {
    await expect(
      loadSource(portsWith({}, { text: Buffer.from('hello') }), OWNER, {
        kind: 'picture',
        pictureId: 'text',
      }),
    ).rejects.toMatchObject({ reason: 'format_unsupported' });
  });
});
