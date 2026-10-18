import { get, type ClientRequest } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TalkFeeds } from '../../src/talk/feeds';
import { testLogger } from '../support/logs';

const SILENCE = Uint8Array.from([0xf8, 0xff, 0xfe]);
const HOUR_OF_PAGES = 180_000;

let feeds: TalkFeeds;

beforeEach(async () => {
  feeds = new TalkFeeds(testLogger('talk'));
  await feeds.start();
});

afterEach(() => {
  feeds.stop();
});

function pagesOf(bytes: Uint8Array): Buffer[] {
  const body = Buffer.from(bytes);
  const pages: Buffer[] = [];
  let offset = 0;
  while (offset + 27 <= body.length && offset + 27 + body.readUInt8(offset + 26) <= body.length) {
    const segments = body.readUInt8(offset + 26);
    let size = 27 + segments;
    for (let index = 0; index < segments; index += 1) {
      size += body.readUInt8(offset + 27 + index);
    }
    if (offset + size > body.length) {
      break;
    }
    pages.push(body.subarray(offset, offset + size));
    offset += size;
  }
  return pages;
}

function readPages(
  url: string,
  count: number,
): Promise<{ request: ClientRequest; pages: Buffer[] }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const request = get(url, (response) => {
      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        const pages = pagesOf(Buffer.concat(chunks));
        if (pages.length >= count) {
          resolve({ request, pages });
        }
      });
    });
    request.once('error', reject);
  });
}

describe('talk feeds', () => {
  it('keeps a bounded page buffer through an hour of silence and still serves the headers', async () => {
    const feed = feeds.open();
    for (let index = 0; index < HOUR_OF_PAGES; index += 1) {
      feed.packet(SILENCE);
    }
    feed.end();
    const response = await fetch(feed.url);
    const pages = pagesOf(new Uint8Array(await response.arrayBuffer()));
    expect(pages.length).toBeLessThanOrEqual(2 + 1_500);
    expect(pages[0]?.subarray(0, 4).toString('latin1')).toBe('OggS');
    expect(pages[0]?.includes('OpusHead')).toBe(true);
    expect(pages[1]?.includes('OpusTags')).toBe(true);
    expect(pages.at(-1)?.readUInt8(5)).toBe(4);
  });

  it('gives a reader that joins late the headers and every page written before it joined', async () => {
    const feed = feeds.open();
    for (let index = 0; index < 400; index += 1) {
      feed.packet(SILENCE);
    }
    const { request, pages } = await readPages(feed.url, 2 + 400);
    expect(pages[0]?.includes('OpusHead')).toBe(true);
    expect(pages[1]?.includes('OpusTags')).toBe(true);
    expect(pages).toHaveLength(2 + 400);
    request.destroy();
    feed.end();
  });
});
