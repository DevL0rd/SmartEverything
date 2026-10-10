import { createCipheriv, createDecipheriv } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { crc32 } from 'node:zlib';

const PREFIX = 0x000055aa;
const SUFFIX = 0x0000aa55;
const CONTROL = 7;
const STATUS = 8;
const HEART_BEAT = 9;
const DP_QUERY = 10;
const DP_REFRESH = 18;
const VERSION_HEADER = Buffer.concat([Buffer.from('3.3'), Buffer.alloc(12)]);

export interface ReceivedControl {
  readonly dps: Record<string, unknown>;
  readonly cid: string | null;
}

function encrypt(key: string, text: string): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(text), cipher.final()]);
}

function decrypt(key: string, data: Buffer): string {
  const decipher = createDecipheriv('aes-128-ecb', key, null);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function frame(sequence: number, command: number, payload: Buffer): Buffer {
  const body = Buffer.concat([Buffer.alloc(4), payload]);
  const header = Buffer.alloc(16);
  header.writeUInt32BE(PREFIX, 0);
  header.writeUInt32BE(sequence, 4);
  header.writeUInt32BE(command, 8);
  header.writeUInt32BE(body.length + 8, 12);
  const unsigned = Buffer.concat([header, body]);
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32BE(crc32(unsigned), 0);
  trailer.writeUInt32BE(SUFFIX, 4);
  return Buffer.concat([unsigned, trailer]);
}

function payloadObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, received ${text}`);
  }
  return Object.fromEntries(Object.entries(parsed));
}

export class FakeTuyaDevice {
  readonly controls: ReceivedControl[] = [];
  readonly unreadable: string[] = [];
  readonly dps = new Map<string | null, Record<string, unknown>>();
  answerKey: string;
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private sequence = 100;

  constructor(
    readonly id: string,
    public key: string,
  ) {
    this.answerKey = key;
    this.server = createServer((socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
      socket.on('error', (error) => {
        this.unreadable.push(error.message);
      });
      socket.on('data', (chunk) => {
        this.receive(socket, Buffer.from(chunk));
      });
    });
  }

  async listen(host = '127.0.0.1', port = 0): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(port, host, resolve));
    const address = this.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('the fake device has no TCP port');
    }
    return address.port;
  }

  get connections(): number {
    return this.sockets.size;
  }

  push(dps: Record<string, unknown>, cid: string | null = null): void {
    this.dps.set(cid, { ...this.dps.get(cid), ...dps });
    const body = JSON.stringify({ devId: this.id, dps, t: 1, ...(cid === null ? {} : { cid }) });
    for (const socket of this.sockets) {
      socket.write(
        frame(
          this.sequence++,
          STATUS,
          Buffer.concat([VERSION_HEADER, encrypt(this.answerKey, body)]),
        ),
      );
    }
  }

  dropConnections(): void {
    for (const socket of this.sockets) {
      socket.destroy();
    }
  }

  async close(): Promise<void> {
    this.dropConnections();
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  private receive(socket: Socket, chunk: Buffer): void {
    let rest = chunk;
    while (rest.length >= 24 && rest.readUInt32BE(0) === PREFIX) {
      const length = rest.readUInt32BE(12);
      const sequence = rest.readUInt32BE(4);
      const command = rest.readUInt32BE(8);
      const payload = rest.subarray(16, 16 + length - 8);
      rest = rest.subarray(16 + length);
      try {
        this.handle(socket, sequence, command, payload);
      } catch (error) {
        this.unreadable.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  private handle(socket: Socket, sequence: number, command: number, payload: Buffer): void {
    if (command === HEART_BEAT) {
      socket.write(frame(sequence, HEART_BEAT, Buffer.alloc(0)));
      return;
    }
    const encrypted =
      command === DP_QUERY || command === DP_REFRESH ? payload : payload.subarray(15);
    const request = payloadObject(decrypt(this.key, encrypted));
    const cid = typeof request['cid'] === 'string' ? request['cid'] : null;
    if (command === DP_QUERY) {
      const body = JSON.stringify({
        devId: this.id,
        dps: this.dps.get(cid) ?? {},
        ...(cid === null ? {} : { cid }),
      });
      socket.write(frame(sequence, DP_QUERY, encrypt(this.answerKey, body)));
      return;
    }
    if (command === CONTROL) {
      const dps = payloadObject(JSON.stringify(request['dps']));
      this.controls.push({ dps, cid });
      socket.write(frame(sequence, CONTROL, Buffer.alloc(0)));
      this.push(dps, cid);
    }
  }
}
