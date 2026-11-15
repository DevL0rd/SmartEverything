import { describe, expect, it, vi } from 'vitest';
import { TEXT_HEAD_BYTES, decodeHead, readTextHead, type FetchText } from './text-head';

const URL_OF_FILE = 'https://hub.test/drive/file/signed';

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function answering(body: Uint8Array, status = 206): FetchText {
  return vi.fn<FetchText>(() => {
    const copy = new Uint8Array(body.byteLength);
    copy.set(body);
    return Promise.resolve(new Response(copy, { status }));
  });
}

describe('readTextHead', () => {
  it('reads a small file whole with one ranged request', async () => {
    const fetchText = answering(bytesOf('line one\nline two'));
    const head = await readTextHead(URL_OF_FILE, 17, fetchText, TEXT_HEAD_BYTES);
    expect(fetchText).toHaveBeenCalledWith(URL_OF_FILE, { headers: { Range: 'bytes=0-16' } });
    expect(head).toEqual({ text: 'line one\nline two', shownBytes: 17, partial: false });
  });

  it('asks only for the head of a large file and marks it partial', async () => {
    const fetchText = answering(new Uint8Array(TEXT_HEAD_BYTES).fill(0x61));
    const head = await readTextHead(URL_OF_FILE, TEXT_HEAD_BYTES * 3, fetchText, TEXT_HEAD_BYTES);
    expect(fetchText).toHaveBeenCalledWith(URL_OF_FILE, {
      headers: { Range: `bytes=0-${String(TEXT_HEAD_BYTES - 1)}` },
    });
    expect(head.partial).toBe(true);
    expect(head.shownBytes).toBe(TEXT_HEAD_BYTES);
  });

  it('reads nothing for an empty file', async () => {
    const fetchText = answering(new Uint8Array());
    expect(await readTextHead(URL_OF_FILE, 0, fetchText, TEXT_HEAD_BYTES)).toEqual({
      text: '',
      shownBytes: 0,
      partial: false,
    });
    expect(fetchText).not.toHaveBeenCalled();
  });

  it('fails when the hub refuses the range', async () => {
    await expect(
      readTextHead(URL_OF_FILE, 40, answering(new Uint8Array(), 403), TEXT_HEAD_BYTES),
    ).rejects.toThrow('The connection answered 403.');
  });
});

describe('decodeHead', () => {
  it('drops a character cut in half at the end of a partial head', () => {
    const whole = bytesOf('café');
    const cut = whole.subarray(0, whole.byteLength - 1);
    expect(decodeHead(cut, whole.byteLength, TEXT_HEAD_BYTES).text).toBe('caf');
  });

  it('keeps only the head when the hub sends more than asked', () => {
    const head = decodeHead(
      new Uint8Array(TEXT_HEAD_BYTES + 10).fill(0x62),
      TEXT_HEAD_BYTES + 10,
      TEXT_HEAD_BYTES,
    );
    expect(head.shownBytes).toBe(TEXT_HEAD_BYTES);
    expect(head.partial).toBe(true);
  });

  it('reads only up to the asked limit', async () => {
    const fetchText = answering(new Uint8Array(2048).fill(0x63));
    const head = await readTextHead(URL_OF_FILE, 2048, fetchText, 1024);
    expect(fetchText).toHaveBeenCalledWith(URL_OF_FILE, { headers: { Range: 'bytes=0-1023' } });
    expect(head).toMatchObject({ shownBytes: 1024, partial: true });
  });
});
