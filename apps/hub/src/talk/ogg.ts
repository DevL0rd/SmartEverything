import { samplesOf } from './opus-packets';

const CAPTURE = Buffer.from('OggS', 'latin1');
const HEADER_BYTES = 27;
const MAX_SEGMENTS = 255;
const BOS = 0x02;
const EOS = 0x04;
const PRE_SKIP = 312;
const SAMPLE_RATE = 48_000;
const VENDOR = 'SmartEverything';

const CRC_POLYNOMIAL = 0x04c11db7;

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x80000000 ? (crc << 1) ^ CRC_POLYNOMIAL : crc << 1;
    }
    crc >>>= 0;
  }
  return crc;
}

function lacing(length: number): number[] {
  const values = new Array<number>(Math.floor(length / 255)).fill(255);
  values.push(length % 255);
  return values;
}

function opusHead(): Buffer {
  const head = Buffer.alloc(19);
  head.write('OpusHead', 0, 'latin1');
  head.writeUInt8(1, 8);
  head.writeUInt8(1, 9);
  head.writeUInt16LE(PRE_SKIP, 10);
  head.writeUInt32LE(SAMPLE_RATE, 12);
  head.writeInt16LE(0, 16);
  head.writeUInt8(0, 18);
  return head;
}

function opusTags(): Buffer {
  const vendor = Buffer.from(VENDOR, 'utf8');
  const tags = Buffer.alloc(8 + 4 + vendor.byteLength + 4);
  tags.write('OpusTags', 0, 'latin1');
  tags.writeUInt32LE(vendor.byteLength, 8);
  vendor.copy(tags, 12);
  tags.writeUInt32LE(0, 12 + vendor.byteLength);
  return tags;
}

interface PageInput {
  readonly flags: number;
  readonly granule: bigint;
  readonly packets: readonly Uint8Array[];
}

export class OggOpusWriter {
  private sequence = 0;
  private granule = 0n;
  private pending: Uint8Array[] = [];
  private segments = 0;

  constructor(
    private readonly serial: number,
    private readonly emit: (page: Buffer) => void,
  ) {}

  start(): void {
    this.page({ flags: BOS, granule: 0n, packets: [opusHead()] });
    this.page({ flags: 0, granule: 0n, packets: [opusTags()] });
  }

  packet(packet: Uint8Array): void {
    const needed = lacing(packet.byteLength).length;
    if (this.segments + needed > MAX_SEGMENTS) {
      this.flush();
    }
    this.pending.push(packet);
    this.segments += needed;
    this.granule += BigInt(samplesOf(packet));
  }

  flush(): void {
    if (this.pending.length === 0) {
      return;
    }
    this.page({ flags: 0, granule: this.granule, packets: this.pending });
    this.pending = [];
    this.segments = 0;
  }

  end(): void {
    const packets = this.pending;
    this.pending = [];
    this.segments = 0;
    this.page({ flags: EOS, granule: this.granule, packets });
  }

  private page(input: PageInput): void {
    const table = input.packets.flatMap((packet) => lacing(packet.byteLength));
    const header = Buffer.alloc(HEADER_BYTES + table.length);
    CAPTURE.copy(header, 0);
    header.writeUInt8(0, 4);
    header.writeUInt8(input.flags, 5);
    header.writeBigInt64LE(input.granule, 6);
    header.writeUInt32LE(this.serial, 14);
    header.writeUInt32LE(this.sequence, 18);
    header.writeUInt8(table.length, 26);
    Buffer.from(table).copy(header, HEADER_BYTES);
    const page = Buffer.concat([header, ...input.packets]);
    page.writeUInt32LE(oggCrc(page), 22);
    this.sequence += 1;
    this.emit(page);
  }
}

export class OggStreamError extends Error {
  override readonly name = 'OggStreamError';
}

export class OggPacketReader {
  private buffered = Buffer.alloc(0);
  private partial: Buffer[] = [];
  private headersLeft = 2;

  constructor(private readonly onPacket: (packet: Uint8Array) => void) {}

  push(chunk: Uint8Array): void {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    let page = this.nextPage();
    while (page !== null) {
      this.readPage(page.table, page.body);
      page = this.nextPage();
    }
  }

  private nextPage(): { table: Buffer; body: Buffer } | null {
    if (this.buffered.byteLength < HEADER_BYTES) {
      return null;
    }
    if (!this.buffered.subarray(0, 4).equals(CAPTURE)) {
      throw new OggStreamError('The audio stream lost its Ogg page boundary.');
    }
    const count = this.buffered.readUInt8(26);
    const table = this.buffered.subarray(HEADER_BYTES, HEADER_BYTES + count);
    const size = table.reduce((sum, value) => sum + value, 0);
    const end = HEADER_BYTES + count + size;
    if (this.buffered.byteLength < end) {
      return null;
    }
    const body = this.buffered.subarray(HEADER_BYTES + count, end);
    this.buffered = this.buffered.subarray(end);
    return { table: Buffer.from(table), body: Buffer.from(body) };
  }

  private readPage(table: Buffer, body: Buffer): void {
    let offset = 0;
    for (const value of table) {
      this.partial.push(body.subarray(offset, offset + value));
      offset += value;
      if (value < 255) {
        this.complete(Buffer.concat(this.partial));
        this.partial = [];
      }
    }
  }

  private complete(packet: Buffer): void {
    if (this.headersLeft > 0) {
      this.headersLeft -= 1;
      return;
    }
    if (packet.byteLength > 0) {
      this.onPacket(packet);
    }
  }
}
