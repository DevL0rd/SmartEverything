import { describe, expect, it } from 'vitest';
import { loadSource, type PrintPorts } from '../../../src/plugins/builtin/printer/print';
import { OWNER } from './service-rig';

const PDF = Buffer.from('%PDF-1.4 a');
const OTHER_PDF = Buffer.from('%PDF-1.4 b');

function portsWith(files: Readonly<Record<string, Buffer>>): PrintPorts {
  return {
    converter: {
      pdfToRaster: () => Promise.reject(new Error('unused')),
      imageToRaster: () => Promise.reject(new Error('unused')),
      imageToJpeg: () => Promise.reject(new Error('unused')),
    },
    files: {
      fromUpload: () => Promise.resolve(null),
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
