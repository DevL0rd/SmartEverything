import { randomUUID } from 'node:crypto';
import {
  BrowserPolicyError,
  legacyConsoleRecords,
  type PreviewRecordRefusal,
  PREVIEW_CAPTURE_MAX_BYTES,
  PREVIEW_LOG_RECORD_MAX_BYTES,
  type NativeBrowserDiagnostic,
  type PreviewConsoleRecord,
  type PreviewPixels,
} from '@smarteverything/domain';
import { screen, type BrowserWindow, type WebContentsView, type Rectangle } from 'electron';

const MAX_RECORDS = 512;
const RETAINED_BYTES = 1024 * 1024;
const MAX_PIXELS = 16_000_000;
export class BrowserDiagnostics {
  private epoch = '';
  private raw = false;
  private refusedRecords: PreviewRecordRefusal[] = [];
  private sequence = 0;
  private visible = false;
  private available = false;
  private records: PreviewConsoleRecord[] = [];
  private queued: PreviewConsoleRecord[] = [];
  private bytes = 0;
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private readonly window: BrowserWindow,
    private readonly view: WebContentsView,
    private readonly id: string,
  ) {
    const contents = view.webContents;
    contents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) this.start();
    });
    contents.on('console-message', (details) => {
      this.record({
        level: details.level,
        message: details.message,
        source: details.sourceId,
        line: details.lineNumber,
      });
    });
    const changed = (): void => {
      this.availability();
    };
    window.on('focus', changed);
    window.on('blur', changed);
    window.on('show', changed);
    window.on('hide', changed);
    window.on('minimize', changed);
    window.on('restore', changed);
    contents.once('destroyed', () => {
      window.removeListener('focus', changed);
      window.removeListener('blur', changed);
      window.removeListener('show', changed);
      window.removeListener('hide', changed);
      window.removeListener('minimize', changed);
      window.removeListener('restore', changed);
      if (this.timer !== null) clearTimeout(this.timer);
    });
  }
  observe(version: 2 | undefined): void {
    this.raw = version === 2;
    this.replay();
  }
  layout(visible: boolean): void {
    this.visible = visible;
    this.availability();
  }
  current(): string {
    return this.epoch;
  }
  private start(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.epoch = randomUUID();
    this.sequence = 0;
    this.refusedRecords = [];
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
    for (let index = 0; index < this.records.length; index += 64)
      this.emit({
        kind: 'records',
        id: this.id,
        epoch: this.epoch,
        records: this.records.slice(index, index + 64),
      });
    this.emit({
      kind: 'snapshot',
      id: this.id,
      epoch: this.epoch,
      lastRecordId: this.sequence,
      refusedRecords: this.refusedRecords,
    });
  }
  private availability(force = false): void {
    const visible = this.visible && this.windowAvailable();
    if (!force && visible === this.available) return;
    if (visible) this.flush();
    this.available = visible;
    if (this.epoch !== '')
      this.emit({ kind: 'availability', id: this.id, epoch: this.epoch, visible });
    if (!visible) this.flush();
  }
  private windowAvailable(): boolean {
    return (
      !this.window.isDestroyed() &&
      this.window.isVisible() &&
      !this.window.isMinimized() &&
      this.window.isFocused()
    );
  }
  private record(input: {
    readonly level: string;
    readonly message: string;
    readonly source: string;
    readonly line: number;
  }): void {
    if (this.epoch === '' || this.view.webContents.isDestroyed()) return;
    const text = input.message;
    const location = `${input.source}:${String(input.line)}`;
    const truncatedBytes = 0;
    const record: PreviewConsoleRecord = {
      id: ++this.sequence,
      time: new Date().toISOString(),
      level: severity(input.level),
      message: text,
      source: location,
      stack: null,
      truncatedBytes,
    };
    const bytes = Buffer.byteLength(JSON.stringify(record));
    if (bytes > PREVIEW_LOG_RECORD_MAX_BYTES) {
      this.flush();
      const refusal = {
        recordId: record.id,
        byteLength: bytes,
        reason:
          'The browser console entry exceeds its 64 KiB transport limit; its text was not modified or stored.',
      };
      this.refusedRecords = [...this.refusedRecords, refusal].slice(-64);
      this.emit({
        kind: 'record-refused',
        id: this.id,
        epoch: this.epoch,
        recordId: record.id,
        byteLength: bytes,
        reason:
          'The browser console entry exceeds its 64 KiB transport limit; its text was not modified or stored.',
      });
      return;
    }
    this.retain(record, bytes);
    this.queued.push(record);
    if (this.queued.length >= 64) this.flush();
    else
      this.timer ??= setTimeout(() => {
        this.flush();
      }, 50);
  }
  private retain(record: PreviewConsoleRecord, bytes: number): void {
    this.records.push(record);
    this.bytes += bytes;
    while (this.records.length > MAX_RECORDS || this.bytes > RETAINED_BYTES) {
      const oldest = this.records.shift();
      if (oldest === undefined)
        throw new BrowserPolicyError('Browser console retention accounting failed.');
      this.bytes -= Buffer.byteLength(JSON.stringify(oldest));
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
    if (this.window.isDestroyed()) return;
    if (this.raw) {
      this.window.webContents.send('desktop:browser-diagnostic-raw', event);
      return;
    }
    if (event.kind === 'snapshot') {
      if (event.refusedRecords.length > 0) this.legacyRefusal();
      return;
    }
    if (
      event.kind === 'record-refused' ||
      (event.kind === 'records' && !legacyConsoleRecords(event.records))
    ) {
      this.legacyRefusal();
      return;
    }
    this.window.webContents.send('desktop:browser-diagnostic', event);
  }
  private legacyRefusal(): void {
    const contents = this.view.webContents;
    if (contents.isDestroyed()) return;
    this.window.webContents.send('desktop:browser-status', {
      id: this.id,
      url: contents.getURL(),
      loading: contents.isLoading(),
      back: contents.navigationHistory.canGoBack(),
      forward: contents.navigationHistory.canGoForward(),
      problem:
        'Update this app to receive complete raw console output. This console batch was refused without modifying its text.',
    });
  }
  private check(epoch: string): void {
    if (
      epoch !== this.epoch ||
      this.epoch === '' ||
      !this.visible ||
      this.view.webContents.isDestroyed() ||
      this.window.isDestroyed() ||
      !this.window.isVisible() ||
      this.window.isMinimized() ||
      !this.window.isFocused()
    )
      throw new BrowserPolicyError('The current preview is hidden, inactive or changed.');
  }
  private geometry(): {
    readonly bounds: Rectangle;
    readonly windowBounds: Rectangle;
    readonly zoom: number;
    readonly displayId: number;
    readonly scale: number;
  } {
    const windowBounds = this.window.getContentBounds();
    const display = screen.getDisplayMatching(windowBounds);
    return {
      bounds: this.view.getBounds(),
      windowBounds,
      zoom: this.view.webContents.getZoomFactor(),
      displayId: display.id,
      scale: display.scaleFactor,
    };
  }
  async perform(
    epoch: string,
    action: 'capture' | 'clear-cache' | 'clear-cookies' | 'clear-storage',
  ): Promise<PreviewPixels | null> {
    this.check(epoch);
    const contents = this.view.webContents;
    if (action === 'clear-cache') {
      await contents.session.clearCache();
      this.check(epoch);
      return null;
    }
    if (action === 'clear-cookies') {
      await contents.session.clearStorageData({ storages: ['cookies'] });
      this.check(epoch);
      return null;
    }
    if (action === 'clear-storage') {
      await contents.session.clearStorageData();
      await contents.session.clearCache();
      this.check(epoch);
      await contents.executeJavaScript('sessionStorage.clear();localStorage.clear();');
      this.check(epoch);
      return null;
    }
    const geometry = this.geometry();
    const bounds = geometry.bounds;
    if (bounds.width * bounds.height > MAX_PIXELS)
      throw new BrowserPolicyError('The preview viewport exceeds the capture pixel limit.');
    const image = await contents.capturePage();
    this.check(epoch);
    if (JSON.stringify(this.geometry()) !== JSON.stringify(geometry))
      throw new BrowserPolicyError('The preview viewport geometry changed during capture.');
    const bytes = image.toPNG();
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
