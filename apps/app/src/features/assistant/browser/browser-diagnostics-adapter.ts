import * as BrowserDiagnosticsApi from './browser-diagnostics-api';
import { previewDiagnosticsNative } from './browser-diagnostics-platform';
import { DiagnosticsRecovery } from './browser-diagnostics-recovery';
import {
  diagnosticScope,
  diagnosticForeground,
  diagnosticOperationScope,
} from './browser-diagnostics-scope';
import { diagnosticSnapshot } from './browser-diagnostics-snapshot';
import { diagnosticListeners } from './browser-diagnostics-listeners';
import { notify } from '../../../components/toast-store';
import {
  PREVIEW_VIEW_MESSAGE,
  PREVIEW_DIAGNOSTICS_PATH,
  PREVIEW_DIAGNOSTICS_PROTOCOL,
  BEARER_PROTOCOL_PREFIX,
  type NativeBrowserDiagnostics,
  type NativeBrowserDiagnostic,
  type PreviewDiagnosticScope,
  type PreviewConsoleRecord,
  type PreviewRecordRefusal,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { openHubSocket, type HubSocket } from '../../../api/connection/hub-socket';
import { routeFor } from '../../../api/connection/active-route';
import { connectionState } from '../../../api/connection/connection';
import type {
  PreviewDiagnostics,
  PreviewViewScope,
  PreviewDiagnosticsSnapshot,
  PreviewCapture,
  PreviewDocument,
  ConsolePage,
} from './browser-diagnostics-contract';
const log = new Logger('app.preview-diagnostics');
const LOCAL_RECORDS = 200;
class PreviewViewUnavailableError extends Error {
  override readonly name = 'PreviewViewUnavailableError';
}
export function previewDiagnosticsAdapter(scope: PreviewViewScope): PreviewDiagnostics | null {
  const native = previewDiagnosticsNative(scope.target.kind);
  return native === null ? null : new DiagnosticsController(scope, native);
}
class DiagnosticsController implements PreviewDiagnostics {
  private readonly recovery: DiagnosticsRecovery;
  private readonly listeners = new Set<() => void>();
  private readonly stops: (() => void)[] = [];
  private socket: HubSocket | null = null;
  private routeStop: (() => void) | null = null;
  private current: PreviewDiagnosticScope | null = null;
  private records: PreviewConsoleRecord[] = [];
  private pending: PreviewConsoleRecord[] = [];
  private refusedRecords: PreviewRecordRefusal[] = [];
  private requestedVisible = false;
  private nativeVisible = false;
  private clearCookiesAvailable = false;
  private clearStorageAvailable = false;
  private disposed = false;
  private started = false;
  private shared = false;
  private errors = 0;
  private omitted = 0;
  private sequence = 0;
  private exhaustedBefore: number | null = null;
  private snapshot: PreviewDiagnosticsSnapshot;
  constructor(
    private readonly scope: PreviewViewScope,
    private readonly native: NativeBrowserDiagnostics,
  ) {
    this.recovery = new DiagnosticsRecovery({
      connect: this.connect.bind(this),
      eligible: this.visible.bind(this),
      connected: (): boolean => this.socket !== null,
    });
    this.snapshot = this.makeSnapshot();
  }
  readonly read = (): PreviewDiagnosticsSnapshot => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };
  setVisible(visible: boolean): void {
    if (this.disposed) return;
    const resumed = visible && !this.requestedVisible;
    this.requestedVisible = visible;
    if (resumed) this.recovery.resume();
    if (!this.started) this.start();
    this.send();
    this.changed();
  }
  private start(): void {
    this.started = true;
    const change = (): void => {
      this.recovery.resume();
      this.send();
      this.changed();
    };
    this.stops.push(
      ...diagnosticListeners({
        native: this.native,
        event: this.event.bind(this),
        change,
        resume: this.recovery.resume.bind(this.recovery),
      }),
    );
  }
  private visible(): boolean {
    return !this.disposed && this.nativeVisible && this.foregroundVisible();
  }
  private foregroundVisible(): boolean {
    return diagnosticForeground(this.disposed, this.requestedVisible);
  }
  private event(event: NativeBrowserDiagnostic): void {
    if (this.disposed || event.id !== this.scope.target.id) return;
    if (event.kind === 'epoch') {
      this.clearCookiesAvailable = event.clearCookies === true;
      this.clearStorageAvailable = event.clearStorage === true;
      this.startEpoch(event.epoch);
      return;
    }
    if (this.current?.epoch !== event.epoch) return;
    if (event.kind === 'availability') {
      this.nativeVisible = event.visible;
      this.send();
      this.changed();
      return;
    }
    if (event.kind === 'record-refused') {
      this.refuseRecord(event);
      return;
    }
    if (event.kind === 'snapshot') {
      this.refusedRecords = event.refusedRecords;
      this.omitted += Math.max(0, event.lastRecordId - this.sequence);
      this.sequence = Math.max(this.sequence, event.lastRecordId);
      this.send();
      this.changed();
      return;
    }
    this.append(event.records);
  }
  private startEpoch(epoch: string): void {
    if (this.current?.epoch === epoch) return;
    this.socket?.close();
    this.socket = null;
    this.recovery.epoch();
    this.records = [];
    this.pending = [];
    this.sequence = 0;
    this.refusedRecords = [];
    this.shared = false;
    this.errors = 0;
    this.omitted = 0;
    this.exhaustedBefore = null;
    this.current = diagnosticScope(this.scope, epoch);
    this.connect();
    this.changed();
  }
  private refuseRecord(event: PreviewRecordRefusal): void {
    if (event.recordId <= this.sequence) return;
    this.omitted += event.recordId - this.sequence;
    this.sequence = event.recordId;
    this.refusedRecords = [
      ...this.refusedRecords,
      { recordId: event.recordId, byteLength: event.byteLength, reason: event.reason },
    ].slice(-64);
    notify({ message: event.reason, tone: 'critical' });
    this.send();
    this.changed();
  }
  private append(records: readonly PreviewConsoleRecord[]): void {
    for (const record of records) {
      if (record.id <= this.sequence) continue;
      this.omitted += Math.max(0, record.id - this.sequence - 1);
      this.sequence = record.id;
      this.records.push(record);
      this.pending.push(record);
      if (record.level === 'error') this.errors += 1;
    }
    if (this.records.length > LOCAL_RECORDS) this.records = this.records.slice(-LOCAL_RECORDS);
    if (this.pending.length > 512) this.pending = this.pending.slice(-512);
    this.send();
    this.changed();
  }
  private connect(): void {
    if (this.disposed || this.current === null || this.socket !== null) return;
    const state = connectionState.get();
    if (state.status !== 'paired') return;
    this.routeStop ??= routeFor(state.connection).state.subscribe(() => {
      this.recovery.resume();
    });
    const socket = this.open(state.connection);
    if (socket === null) return;
    this.socket = socket;
    socket.onopen = (): void => {
      if (this.socket === socket) {
        this.recovery.opened();
        this.send();
        this.changed();
      }
    };
    socket.onclose = (): void => {
      if (this.socket === socket) {
        this.socket = null;
        this.pending = [...this.records];
        this.changed();
        this.recovery.closed();
      }
    };
    socket.onmessage = (event): void => {
      this.received(socket, event.data);
    };
  }
  private open(connection: { readonly url: string; readonly token: string }): HubSocket | null {
    try {
      return openHubSocket(connection, PREVIEW_DIAGNOSTICS_PATH, [
        PREVIEW_DIAGNOSTICS_PROTOCOL,
        `${BEARER_PROTOCOL_PREFIX}${connection.token}`,
      ]);
    } catch (cause) {
      log.warn('preview.connect_failed', {
        failure: cause instanceof Error ? cause.name : 'TransportFailure',
      });
      this.recovery.closed();
      return null;
    }
  }
  private received(socket: HubSocket, data: unknown): void {
    if (this.socket !== socket) return;
    const response = BrowserDiagnosticsApi.parseViewResponse(data);
    if (response === null) return;
    if (response.kind === 'accepted') {
      if (response.epoch === this.current?.epoch && response.delivery === 'shared') {
        this.shared = true;
        this.changed();
      }
    } else if (response.kind === 'perform') {
      this.answer(response.request, socket).catch((cause: unknown) => {
        log.error('preview.answer_failed', cause);
      });
    } else {
      log.warn('preview.transport_refused', { reason: response.reason });
      socket.close();
    }
  }
  private send(): void {
    this.recovery.activity();
    const socket = this.socket;
    const scope = this.current;
    if (socket === null || scope === null || socket.readyState !== WebSocket.OPEN) return;
    do {
      const records = this.pending.splice(0, 64);
      socket.send(
        JSON.stringify(
          PREVIEW_VIEW_MESSAGE.parse({
            kind: 'write',
            value: {
              scope,
              visible: this.visible(),
              records,
              ...BrowserDiagnosticsApi.browserRecordMetadata(
                this.pending.length === 0,
                this.sequence,
                this.refusedRecords,
              ),
            },
          }),
        ),
      );
    } while (this.pending.length > 0);
  }
  private fence(scope: PreviewDiagnosticScope, needsVisible: boolean): void {
    if (
      (needsVisible && !this.visible()) ||
      this.current !== scope ||
      this.socket?.readyState !== WebSocket.OPEN
    )
      throw new PreviewViewUnavailableError('The preview closed or changed. Open it again.');
  }
  private async answer(
    request: {
      readonly requestId: string;
      readonly scope: PreviewDiagnosticScope;
      readonly action: 'capture' | 'clear-cache' | 'clear-cookies' | 'clear-storage';
    },
    socket: HubSocket,
  ): Promise<void> {
    let pixels;
    let reason: string | null = null;
    try {
      const current = this.current;
      if (current === null || JSON.stringify(current) !== JSON.stringify(request.scope))
        throw new PreviewViewUnavailableError('The requested preview document changed.');
      const capture = request.action === 'capture';
      this.fence(current, capture);
      pixels = await this.native.perform({
        id: this.scope.target.id,
        epoch: current.epoch,
        action: request.action,
      });
      this.fence(current, capture);
      if (pixels === null && request.action === 'capture')
        throw new PreviewViewUnavailableError("Couldn't capture the preview. Try again.");
    } catch (cause) {
      pixels = null;
      reason = cause instanceof Error ? cause.message : 'Preview capture failed.';
    }
    if (socket.readyState === WebSocket.OPEN && this.socket === socket)
      socket.send(
        JSON.stringify(
          PREVIEW_VIEW_MESSAGE.parse({ kind: 'operation-result', request, pixels, reason }),
        ),
      );
  }
  async capture(expected?: PreviewDocument): Promise<PreviewCapture> {
    const current = diagnosticOperationScope(this.current, expected);
    this.fence(current, true);
    const result = await BrowserDiagnosticsApi.captureBrowserViewport(this.scope, current);
    this.fence(current, true);
    diagnosticOperationScope(result.scope, current);
    return { ...result, documentId: result.scope.documentId, epoch: result.scope.epoch };
  }
  async loadOlder(cursor: string): Promise<ConsolePage> {
    const current = this.current;
    if (current === null)
      throw new PreviewViewUnavailableError('Wait for the native preview document.');
    const page = await BrowserDiagnosticsApi.readOlderPreviewRecords(this.scope, current, cursor);
    if (this.disposed || this.current !== current)
      throw new PreviewViewUnavailableError(
        'The preview document changed while loading console records.',
      );
    this.records = [...page.records, ...this.records].slice(-2000);
    if (page.previousCursor === null)
      this.exhaustedBefore = page.retainedFrom ?? this.records.at(0)?.id ?? null;
    this.omitted = page.omittedRecords;
    this.changed();
    return {
      kind: 'ready',
      documentId: page.scope.documentId,
      epoch: page.scope.epoch,
      records: page.records.map((record) => ({ ...record, id: String(record.id) })),
      errors: page.errors,
      previousCursor: page.previousCursor === null ? null : String(page.previousCursor),
      omittedRecords: page.omittedRecords,
      delivery: page.delivery,
    };
  }
  readonly clearCache = this.clear.bind(this, 'clear-cache');
  readonly clearStorage = this.clear.bind(this, 'clear-storage');
  readonly clearCookies = this.clear.bind(this, 'clear-cookies');
  private async clear(
    action: 'clear-cache' | 'clear-cookies' | 'clear-storage',
    expected?: PreviewDocument,
  ): Promise<void> {
    const current = diagnosticOperationScope(this.current, expected);
    this.fence(current, false);
    await BrowserDiagnosticsApi.clearBrowserData(this.scope, current, action);
    this.fence(current, false);
  }
  dispose(): void {
    this.disposed = true;
    this.recovery.dispose();
    this.socket?.close();
    this.socket = null;
    for (const stop of this.stops) stop();
    this.stops.length = 0;
    this.routeStop?.();
    this.routeStop = null;
    this.listeners.clear();
    this.records = [];
    this.pending = [];
  }
  private changed(): void {
    this.snapshot = this.makeSnapshot();
    for (const listener of this.listeners) listener();
  }
  private makeSnapshot(): PreviewDiagnosticsSnapshot {
    return diagnosticSnapshot({
      current: this.current,
      records: this.records,
      visible: this.visible(),
      connected: this.socket?.readyState === WebSocket.OPEN,
      errors: this.errors,
      omitted: this.omitted,
      shared: this.shared,
      exhaustedBefore: this.exhaustedBefore,
      clearCookies: this.clearCookiesAvailable,
      clearStorage: this.clearStorageAvailable,
      waitForLayout:
        this.current !== null &&
        this.foregroundVisible() &&
        !this.nativeVisible &&
        this.socket?.readyState === WebSocket.OPEN,
    });
  }
}
