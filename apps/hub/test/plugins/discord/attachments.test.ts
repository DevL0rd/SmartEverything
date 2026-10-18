import { describe, expect, it } from 'vitest';
import { attachedFiles } from '../../../src/plugins/builtin/discord/attachments';
import { DiscordInputError } from '../../../src/plugins/builtin/discord/errors';
import {
  downloader,
  mimeOf,
  safeFileName,
  type Downloader,
} from '../../../src/plugins/builtin/discord/media-download';
import type { RawAttachment } from '../../../src/plugins/builtin/discord/payloads';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function attachment(filename: string, contentType: string | null = null): RawAttachment {
  return {
    id: '600000000000000001',
    filename,
    size: 10,
    content_type: contentType,
    url: `https://cdn.discordapp.com/attachments/1/2/${encodeURIComponent(filename)}`,
  };
}

const serving =
  (data: Buffer, type: string | null = null): Downloader =>
  () =>
    Promise.resolve({ data, type });

const LIMITS = { enabled: true, maxFileBytes: 1024 * 1024 };

describe('inbound attachments', () => {
  it('accepts a screenshot named with parentheses, sniffing the image type', async () => {
    const result = await attachedFiles([attachment('Screenshot (2).png')], LIMITS, serving(PNG));
    expect(result.notes).toStrictEqual([]);
    expect(result.attachments).toMatchObject([{ name: 'Screenshot -2-.png', mime: 'image/png' }]);
  });

  it('accepts a docx using the type Discord reports', async () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const result = await attachedFiles(
      [attachment('report_v2[final].docx', docx)],
      LIMITS,
      serving(Buffer.from('not sniffable'), docx),
    );
    expect(result.attachments).toMatchObject([{ name: 'report_v2-final-.docx', mime: docx }]);
  });

  it('keeps unknown formats as octet streams instead of dropping them', async () => {
    const result = await attachedFiles(
      [attachment('clip.heic')],
      LIMITS,
      serving(Buffer.from('bytes')),
    );
    expect(result.attachments).toMatchObject([
      { name: 'clip.heic', mime: 'application/octet-stream' },
    ]);
  });

  it('tells the person what it could not attach and keeps the rest', async () => {
    const download: Downloader = (url) =>
      url.includes('bad')
        ? Promise.reject(new DiscordInputError('the file is too big'))
        : serving(PNG)(url, 1);
    const result = await attachedFiles(
      [attachment('bad.png'), attachment('good.png')],
      LIMITS,
      download,
    );
    expect(result.attachments).toHaveLength(1);
    expect(result.notes).toStrictEqual([
      'Attachment "bad.png" was not attached: the file is too big',
    ]);
  });

  it('says so when attachments are switched off', async () => {
    const result = await attachedFiles(
      [attachment('a.png')],
      { ...LIMITS, enabled: false },
      serving(PNG),
    );
    expect(result.attachments).toStrictEqual([]);
    expect(result.notes[0]).toContain('switched off');
  });
});

describe('downloader', () => {
  it('returns the bytes and the reported type', async () => {
    const download = downloader(() =>
      Promise.resolve(new Response('hello', { headers: { 'content-type': 'text/plain' } })),
    );
    const { data, type } = await download('https://cdn.discordapp.com/a.txt', 100);
    expect(data.toString()).toBe('hello');
    expect(type).toBe('text/plain');
  });

  it('refuses a body over the cap, declared or streamed', async () => {
    const declared = downloader(() =>
      Promise.resolve(new Response('x', { headers: { 'content-length': '500' } })),
    );
    await expect(declared('https://cdn.discordapp.com/a.bin', 100)).rejects.toThrow(
      'larger than the 0 KiB limit',
    );
    const streamed = downloader(() => Promise.resolve(new Response('x'.repeat(200))));
    await expect(streamed('https://cdn.discordapp.com/a.bin', 100)).rejects.toBeInstanceOf(
      DiscordInputError,
    );
  });

  it('reports an HTTP failure with the host', async () => {
    const download = downloader(() => Promise.resolve(new Response('no', { status: 404 })));
    await expect(download('https://cdn.discordapp.com/a.bin', 100)).rejects.toThrow(
      'cdn.discordapp.com answered HTTP 404',
    );
  });
});

describe('names and types', () => {
  it('cleans names without refusing any', () => {
    expect(safeFileName('Screenshot (2).png')).toBe('Screenshot -2-.png');
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileName('???')).toBe('file');
  });

  it('prefers the sniffed type, then the header', async () => {
    expect(await mimeOf(PNG, 'text/plain')).toBe('image/png');
    expect(await mimeOf(Buffer.from('a,b'), 'text/csv; charset=utf-8')).toBe('text/csv');
    expect(await mimeOf(Buffer.from('a,b'), null)).toBe('application/octet-stream');
  });
});
