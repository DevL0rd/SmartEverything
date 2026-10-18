import { randomUUID } from 'node:crypto';
import {
  BrowserPolicyError,
  PREVIEW_CAPTURE_MAX_BYTES,
  PREVIEW_LOG_RECORD_MAX_BYTES,
  type NativeBrowserDiagnostic,
  type PreviewConsoleRecord,
  type PreviewPixels,
} from '@smarteverything/domain';

const MAX_RECORDS = 512;
const RETAINED_BYTES = 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const BATCH = 64;
const FLUSH_MS = 50;
export interface DiagnosticsHost {
  readonly windowShown: () => boolean;
  readonly pageClosed: () => boolean;
  readonly bounds: () => { readonly width: number; readonly height: number };
  readonly send: (event: NativeBrowserDiagnostic) => void;
  readonly onNavigate: (listener: () => void) => void;
  readonly onConsole: (listener: (level: string, message: string, source: string) => void) => void;
  readonly onWindowChange: (listener: () => void) => void;
  readonly onClosed: (listener: () => void) => void;
  readonly clear: (what: 'cache' | 'cookies' | 'storage') => Promise<void>;
  readonly capturePng: () => Promise<Buffer>;
}
export class BrowserDiagnostics {
  private epoch = '';
  private sequence = 0;
  private visible = false;
  private available = false;
  private records: PreviewConsoleRecord[] = [];
  private queued: PreviewConsoleRecord[] = [];
  private bytes = 0;
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private readonly host: DiagnosticsHost,
    private readonly id: string,
  ) {
    host.onNavigate(() => {
      this.start();
    });
    host.onConsole((level, message, source) => {
      this.record(level, message, source);
    });
    host.onWindowChange(() => {
      this.availability();
    });
    host.onClosed(() => {
      if (this.timer !== null) clearTimeout(this.timer);
    });
  }
  layout(visible: boolean): void {
    this.visible = visible;
    this.availability();
  }
  private start(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.epoch = randomUUID();
    this.sequence = 0;
    this.records = [];
    this.bytes = 0;
    this.queued = [];
    this.emit({ kind: 'epoch', id: this.id, epoch: this.epoch, clearStorage: true });
    this.availability(true);
  }
  replay(): void {
    if (this.epoch === '') return;
    this.emit({ kind: 'epoch', id: this.id, epoch: this.epoch, clearStorage: true });
    this.availability(true);
    for (let index = 0; index < this.records.length; index += BATCH)
      this.emit({
        kind: 'records',
        id: this.id,
        epoch: this.epoch,
        records: this.records.slice(index, index + BATCH),
      });
    this.emit({
      kind: 'snapshot',
      id: this.id,
      epoch: this.epoch,
      lastRecordId: this.sequence,
      refusedRecords: [],
    });
  }
  private availability(force = false): void {
    const visible = this.visible && this.host.windowShown();
    if (!force && visible === this.available) return;
    if (visible) this.flush();
    this.available = visible;
    if (this.epoch !== '')
      this.emit({ kind: 'availability', id: this.id, epoch: this.epoch, visible });
    if (!visible) this.flush();
  }
  private record(level: string, message: string, source: string): void {
    if (this.epoch === '' || this.host.pageClosed()) return;
    const record = fitRecord({
      id: ++this.sequence,
      time: new Date().toISOString(),
      level: severity(level),
      message,
      source,
      stack: null,
      truncatedBytes: 0,
    });
    this.retain(record);
    this.queued.push(record);
    if (this.queued.length >= BATCH) this.flush();
    else
      this.timer ??= setTimeout(() => {
        this.flush();
      }, FLUSH_MS);
  }
  private retain(record: PreviewConsoleRecord): void {
    this.records.push(record);
    this.bytes += recordBytes(record);
    while (this.records.length > MAX_RECORDS || this.bytes > RETAINED_BYTES) {
      const oldest = this.records.shift();
      if (oldest === undefined) return;
      this.bytes -= recordBytes(oldest);
    }
  }
  private flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const records = this.queued;
    this.queued = [];
    if (records.length > 0) this.emit({ kind: 'records', id: this.id, epoch: this.epoch, records });
  }
  private emit(event: NativeBrowserDiagnostic): void {
    this.host.send(event);
  }
  private check(epoch: string, needsVisible: boolean): void {
    if (
      epoch !== this.epoch ||
      this.epoch === '' ||
      this.host.pageClosed() ||
      (needsVisible && !this.available)
    )
      throw new BrowserPolicyError('The current preview changed or is not showing.');
  }
  async perform(
    epoch: string,
    action: 'capture' | 'clear-cache' | 'clear-cookies' | 'clear-storage',
  ): Promise<PreviewPixels | null> {
    this.check(epoch, action === 'capture');
    if (action === 'clear-cache') await this.host.clear('cache');
    else if (action === 'clear-cookies') await this.host.clear('cookies');
    else if (action === 'clear-storage') await this.host.clear('storage');
    if (action !== 'capture') return null;
    return this.capture(epoch);
  }
  private async capture(epoch: string): Promise<PreviewPixels> {
    const bounds = this.host.bounds();
    if (bounds.width * bounds.height > MAX_PIXELS)
      throw new BrowserPolicyError('The preview viewport exceeds the capture pixel limit.');
    const bytes = await this.host.capturePng();
    this.check(epoch, false);
    const size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    if (
      bytes.length < 24 ||
      bytes.length > PREVIEW_CAPTURE_MAX_BYTES ||
      size.width * size.height > MAX_PIXELS
    )
      throw new BrowserPolicyError('The preview capture exceeds the image byte limit.');
    return {
      dataBase64: bytes.toString('base64'),
      mime: 'image/png',
      width: size.width,
      height: size.height,
      scale: size.width / bounds.width,
      capturedAt: new Date().toISOString(),
    };
  }
}
const SOURCE_MAX = 2048;
function recordBytes(record: PreviewConsoleRecord): number {
  return Buffer.byteLength(JSON.stringify(record));
}
function fitRecord(input: PreviewConsoleRecord): PreviewConsoleRecord {
  const record = { ...input, source: input.source?.slice(0, SOURCE_MAX) ?? null };
  const excess = recordBytes(record) - PREVIEW_LOG_RECORD_MAX_BYTES;
  if (excess <= 0) return record;
  const kept = Buffer.from(record.message).subarray(
    0,
    Math.max(0, Buffer.byteLength(record.message) - excess - 64),
  );
  return {
    ...record,
    message: kept.toString('utf8'),
    truncatedBytes: Buffer.byteLength(record.message) - kept.length,
  };
}
function severity(level: string): PreviewConsoleRecord['level'] {
  switch (level) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'debug':
      return 'debug';
    default:
      return 'info';
  }
}
