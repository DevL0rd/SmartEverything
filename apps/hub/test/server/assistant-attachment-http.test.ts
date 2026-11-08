import { API_ENDPOINTS as E, buildPath } from '@smarteverything/domain';
import { expect, it } from 'vitest';
import { bootServer, type Booted } from '../support/booted';
import { call, temporaryDirectory } from '../support/server';

const BODY = Buffer.from('<script>globalThis.executed = true</script>');
const TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/xml',
  'image/svg+xml',
  'application/javascript',
  'application/pdf',
  'image/png',
  'audio/mpeg',
  'video/mp4',
] as const;

async function upload(running: Booted, mime: string): Promise<string> {
  const admitted = await call(running.base, running.owner, {
    method: E.startAssistantUpload.method,
    path: E.startAssistantUpload.path,
    body: { name: 'document.bin', mime, bytes: BODY.length },
  });
  const { uploadId } = E.startAssistantUpload.response.parse(admitted.body);
  const path = buildPath(E.sendAssistantUploadChunk.path, { uploadId });
  const chunk = await call(running.base, running.owner, {
    method: E.sendAssistantUploadChunk.method,
    path,
    body: { index: 0, data: BODY.toString('base64') },
  });
  expect(chunk.status).toBe(200);
  const finished = await call(running.base, running.owner, {
    method: E.finishAssistantUpload.method,
    path,
  });
  const attachment = E.finishAssistantUpload.response.parse(finished.body);
  expect(attachment.mime).toBe(mime);
  return attachment.id;
}

async function assertDownload(url: string): Promise<void> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/octet-stream');
  expect(response.headers.get('content-disposition')).toContain(
    'attachment; filename="document.bin"',
  );
  expect(response.headers.get('content-security-policy')).toBe("sandbox; default-src 'none'");
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(BODY);
}

async function assertInline(url: string, mime: string): Promise<void> {
  const response = await fetch(url, { headers: { range: 'bytes=0-2' } });
  expect(response.status).toBe(206);
  expect(response.headers.get('content-type')).toBe(mime);
  expect(response.headers.get('content-disposition')).toBeNull();
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(BODY.subarray(0, 3));
}

it('forces active signed attachments to download and preserves ranged inline media', async () => {
  const fixture = await temporaryDirectory();
  try {
    const running = await bootServer(fixture.path);
    try {
      const ids = await Promise.all(TYPES.map((mime) => upload(running, mime)));
      const links = await call(running.base, running.owner, {
        method: E.assistantAttachmentLinks.method,
        path: E.assistantAttachmentLinks.path,
        body: { ids },
      });
      const signed = E.assistantAttachmentLinks.response.parse(links.body);
      for (const [index, link] of signed.entries()) {
        const mime = TYPES[index];
        const url = new URL(link.url, running.base);
        if (mime === 'image/png' || mime === 'audio/mpeg' || mime === 'video/mp4') {
          await assertInline(url.href, mime);
        } else {
          await assertDownload(url.href);
        }
        const unsigned = await fetch(new URL(url.pathname, running.base));
        expect(unsigned.status).toBe(401);
        await unsigned.arrayBuffer();
      }
    } finally {
      await running.server.stop();
    }
  } finally {
    await fixture.remove();
  }
});
