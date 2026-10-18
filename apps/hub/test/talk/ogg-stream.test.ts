import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OggOpusWriter, OggPacketReader, OggStreamError, oggCrc } from '../../src/talk/ogg';
import { OpusPacketError } from '../../src/talk/opus-packets';

const TWENTY_MS_TOC = 0xf8;
const TWENTY_MS_SAMPLES = 960;

function opusPacket(size: number, fill: number): Uint8Array {
  const packet = new Uint8Array(size).fill(fill);
  packet[0] = TWENTY_MS_TOC;
  return packet;
}

function written(packets: readonly Uint8Array[], flushEvery = 0): Buffer[] {
  const pages: Buffer[] = [];
  const writer = new OggOpusWriter(7, (page) => pages.push(page));
  writer.start();
  packets.forEach((packet, index) => {
    writer.packet(packet);
    if (flushEvery > 0 && (index + 1) % flushEvery === 0) {
      writer.flush();
    }
  });
  writer.end();
  return pages;
}

function readBack(chunks: readonly Uint8Array[]): Uint8Array[] {
  const packets: Uint8Array[] = [];
  const reader = new OggPacketReader((packet) => packets.push(packet));
  for (const chunk of chunks) {
    reader.push(chunk);
  }
  return packets;
}

function withoutChecksum(page: Buffer): Buffer {
  const copy = Buffer.from(page);
  copy.writeUInt32LE(0, 22);
  return copy;
}

describe('OggOpusWriter', () => {
  it('opens with an OpusHead page flagged as the start and an OpusTags page', () => {
    const pages = written([]);
    expect(pages[0]?.subarray(0, 4).toString('latin1')).toBe('OggS');
    expect(pages[0]?.readUInt8(5)).toBe(0x02);
    expect(pages[0]?.subarray(27 + 1, 27 + 1 + 8).toString('latin1')).toBe('OpusHead');
    expect(pages[1]?.readUInt8(5)).toBe(0);
    expect(pages[1]?.includes('OpusTags')).toBe(true);
    expect(pages[1]?.includes('SmartEverything')).toBe(true);
  });

  it('numbers pages in order under one serial and checksums every page', () => {
    const pages = written(
      Array.from({ length: 5 }, (_, index) => opusPacket(40, index)),
      2,
    );
    expect(pages.map((page) => page.readUInt32LE(18))).toEqual(pages.map((_, index) => index));
    for (const page of pages) {
      expect(page.readUInt32LE(14)).toBe(7);
      expect(page.readUInt32LE(22)).toBe(oggCrc(withoutChecksum(page)));
    }
  });

  it('stamps each audio page with the samples written so far and marks the last page as the end', () => {
    const pages = written(
      Array.from({ length: 4 }, () => opusPacket(40, 1)),
      2,
    );
    const audio = pages.slice(2);
    expect(audio.map((page) => page.readBigInt64LE(6))).toEqual([
      BigInt(2 * TWENTY_MS_SAMPLES),
      BigInt(4 * TWENTY_MS_SAMPLES),
      BigInt(4 * TWENTY_MS_SAMPLES),
    ]);
    expect(audio.map((page) => page.readUInt8(5))).toEqual([0, 0, 0x04]);
    expect(audio.at(-1)?.readUInt8(26)).toBe(0);
  });

  it('starts a new page before a packet would push a page past 255 segments', () => {
    const pages = written(Array.from({ length: 300 }, () => opusPacket(20, 3)));
    const audio = pages.slice(2);
    expect(audio.map((page) => page.readUInt8(26))).toEqual([255, 45]);
    expect(readBack(pages)).toHaveLength(300);
  });

  it('flush writes nothing when no packet is pending', () => {
    const pages: Buffer[] = [];
    const writer = new OggOpusWriter(1, (page) => pages.push(page));
    writer.start();
    writer.flush();
    expect(pages).toHaveLength(2);
  });

  it('rejects a packet that is not Opus', () => {
    const writer = new OggOpusWriter(1, (): void => undefined);
    expect(() => {
      writer.packet(new Uint8Array(0));
    }).toThrow(OpusPacketError);
  });
});

describe('OggPacketReader', () => {
  it('returns the written packets, byte for byte, without the two header packets', () => {
    const packets = [opusPacket(40, 1), opusPacket(300, 2), opusPacket(255, 3), opusPacket(510, 4)];
    const read = readBack(written(packets, 2));
    expect(read.map((packet) => Buffer.from(packet))).toEqual(packets.map((p) => Buffer.from(p)));
  });

  it('reassembles the same packets however the bytes are cut into chunks', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 700 }), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 1, max: 64 }),
        (sizes, chunkSize) => {
          const packets = sizes.map((size, index) => opusPacket(size, index + 1));
          const stream = Buffer.concat(written(packets, 3));
          const chunks: Uint8Array[] = [];
          for (let offset = 0; offset < stream.byteLength; offset += chunkSize) {
            chunks.push(stream.subarray(offset, offset + chunkSize));
          }
          expect(readBack(chunks).map((packet) => packet.byteLength)).toEqual(sizes);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('holds back a page until all of it has arrived', () => {
    const stream = Buffer.concat(written([opusPacket(40, 1)]));
    const packets: Uint8Array[] = [];
    const reader = new OggPacketReader((packet) => packets.push(packet));
    reader.push(stream.subarray(0, stream.byteLength - 1));
    expect(packets).toHaveLength(0);
    reader.push(stream.subarray(stream.byteLength - 1));
    expect(packets).toHaveLength(1);
  });

  it('fails loudly when the stream does not start a page with OggS', () => {
    const reader = new OggPacketReader((): void => undefined);
    expect(() => {
      reader.push(Buffer.alloc(40, 1));
    }).toThrow(OggStreamError);
  });
});
