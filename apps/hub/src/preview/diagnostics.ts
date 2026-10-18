import type { StoredEvent } from '../store/repositories/assistant-events';
import { previewErrorFingerprint, previewErrorScope } from './error-fingerprint';
import { diagnosticIdentity, previewReportText, PREVIEW_REPORT_PREFIX } from './diagnostic-report';
import { onPreviewAuthorityChange } from './authority-events';
import type { ViewerFocus } from './viewer-focus';
import { randomUUID } from 'node:crypto';
import {
  ApiError,
  PREVIEW_LOG_READ,
  PREVIEW_LOG_SEARCH,
  PREVIEW_CAPTURE_MAX_BYTES,
  type PreviewErrorRule,
  type PREVIEW_ERROR_IGNORE,
  type PREVIEW_ERROR_RESTORE,
  type PreviewDiagnosticScope,
  type PreviewConsoleRecord,
  type PreviewPixels,
  type PreviewLogPage,
  type PREVIEW_VIEW_WRITE,
  type PREVIEW_CAPTURE_SELECTOR,
  type PREVIEW_BROWSER_REQUEST,
  type PREVIEW_CAPTURE_RESULT,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import { imageSize } from '../assistant/image/dimensions';
import type { AssistantService } from '../assistant/service';
import type { PreviewDiagnosticAuthority } from './diagnostic-authority';
import { PreviewRecords } from './diagnostic-records';
type DiagnosticsAssistant = Pick<AssistantService, 'admitDelivery' | 'previewError'> & {
  readonly files: Pick<AssistantService['files'], 'keepBytes' | 'remove'>;
};
class ViewerReplacedError extends ApiError {
  constructor() {
    super('conflict', 'The page reloaded or its viewer reconnected during the capture.');
  }
}
interface Viewer {
  readonly scope: PreviewDiagnosticScope;
  readonly records: PreviewRecords;
  readonly capture: (
    request: z.infer<typeof PREVIEW_BROWSER_REQUEST>,
  ) => Promise<PreviewPixels | null>;
  readonly close: () => void;
  visible: boolean;
  revision: string | null;
}
export class PreviewDiagnostics {
  private readonly retiredConnections = new WeakSet<() => void>();
  private readonly viewers = new Map<string, Viewer>();
  private readonly wakes = new Map<string, PreviewDiagnosticScope>();
  private readonly stopFeed: () => void;
  private readonly stopAdmission: () => void;
  constructor(
    private readonly store: Store,
    readonly authority: PreviewDiagnosticAuthority,
    private readonly assistant: DiagnosticsAssistant,
    private readonly focus: ViewerFocus,
  ) {
    this.stopAdmission = assistant.admitDelivery((event) => this.admit(event));
    this.stopFeed = onPreviewAuthorityChange(store, () => {
      this.revalidate();
    });
  }
  write(
    value: z.infer<typeof PREVIEW_VIEW_WRITE>,
    connection: { readonly capture: Viewer['capture']; readonly close: () => void },
  ): { readonly epoch: string; readonly delivery: 'none' | 'shared' } {
    const { scope } = value;
    const revision = this.authority.validate(scope);
    if (this.retiredConnections.has(connection.close))
      throw new ApiError('conflict', 'This preview connection was retired.');
    this.retirePrevious(scope, connection.close);
    const viewer = this.viewerFor(scope, connection, revision);
    if (value.visible && !viewer.visible) this.focus.touch(scope.viewerId);
    viewer.visible = value.visible;
    viewer.revision = revision;
    viewer.records.append(value.records);
    viewer.records.observe(value.lastRecordId, value.refusedRecords);
    if (revision !== null) this.wake(viewer, value.records, revision);
    return { epoch: scope.epoch, delivery: this.shared(viewer) ? 'shared' : 'none' };
  }
  private viewerFor(
    scope: PreviewDiagnosticScope,
    connection: { readonly capture: Viewer['capture']; readonly close: () => void },
    revision: string | null,
  ): Viewer {
    const key = diagnosticIdentity(scope);
    const existing = this.viewers.get(key);
    if (existing?.close === connection.close) return existing;
    const viewer: Viewer = {
      scope,
      records: existing?.records ?? new PreviewRecords(),
      capture: connection.capture,
      close: connection.close,
      visible: false,
      revision,
    };
    this.viewers.set(key, viewer);
    if (existing !== undefined) {
      this.retiredConnections.add(existing.close);
      existing.close();
    }
    return viewer;
  }
  private wake(viewer: Viewer, records: readonly PreviewConsoleRecord[], revision: string): void {
    if (viewer.visible && this.wakes.has(revision)) this.wakes.set(revision, viewer.scope);
    const error = records.find((record) => this.wakeAllowed(viewer.scope, record));
    if (viewer.visible && error !== undefined) this.report(viewer, error.id, revision);
  }
  private wakeAllowed(scope: PreviewDiagnosticScope, record: PreviewConsoleRecord): boolean {
    return (
      record.level === 'error' &&
      !this.store.previewErrorRules.ignored(
        scope.chatId,
        previewErrorScope(scope, record),
        previewErrorFingerprint(record),
      )
    );
  }
  readErrorRules(caller: Caller, chat: string): readonly PreviewErrorRule[] {
    this.authority.caller(caller, chat);
    this.store.aiChats.assertWorkAllowed(chat);
    return this.store.previewErrorRules.list(chat);
  }
  ignoreError(
    caller: Caller,
    chat: string,
    input: z.infer<typeof PREVIEW_ERROR_IGNORE>,
  ): readonly PreviewErrorRule[] {
    this.readErrorRules(caller, chat);
    const viewer = this.select(caller, chat, input);
    const record = viewer.records.records.find((entry) => entry.id === input.recordId);
    if (record?.level !== 'error' || record.truncatedBytes !== 0)
      throw new ApiError(
        'invalid_request',
        'Choose a complete error record from this viewer; warnings and other levels never wake the AI and need no rule.',
      );
    this.store.previewErrorRules.put(chat, {
      scopeKey: previewErrorScope(viewer.scope, record),
      fingerprint: previewErrorFingerprint(record),
      reason: input.reason,
      sample: record.message.slice(0, 512),
    });
    return this.store.previewErrorRules.list(chat);
  }
  restoreError(
    caller: Caller,
    chat: string,
    input: z.infer<typeof PREVIEW_ERROR_RESTORE>,
  ): readonly PreviewErrorRule[] {
    this.readErrorRules(caller, chat);
    this.store.previewErrorRules.remove(chat, input.scopeKey, input.fingerprint);
    return this.store.previewErrorRules.list(chat);
  }
  private shared(viewer: Viewer): boolean {
    return (
      viewer.revision !== null && this.store.assistantEvents.find(viewer.revision) !== undefined
    );
  }
  private report(viewer: Viewer, errorId: number, revision: string): void {
    if (this.store.assistantEvents.find(revision) !== undefined) return;
    this.wakes.set(revision, viewer.scope);
    this.assistant.previewError(
      revision,
      viewer.scope,
      previewReportText(viewer.scope, viewer.records.records, viewer.records.omitted, errorId),
    );
  }
  disconnect(close: () => void): void {
    for (const [key, viewer] of this.viewers) if (viewer.close === close) this.retire(key, viewer);
  }
  private select(
    caller: Caller,
    chat: string,
    input: z.infer<typeof PREVIEW_CAPTURE_SELECTOR>,
  ): Viewer {
    const profile = this.authority.caller(caller, chat);
    const open = [...this.viewers.values()].filter(
      (viewer) =>
        viewer.scope.chatId === chat &&
        viewer.scope.profileId === profile &&
        matchingViewer(viewer.scope, input),
    );
    const showing = open.filter((viewer) => viewer.visible);
    const viewer = this.focus.latest(showing.length > 0 ? showing : open, (v) => v.scope.viewerId);
    if (viewer === undefined)
      throw new ApiError('conflict', 'No matching preview is open on a connected device.');
    this.authority.validate(viewer.scope);
    return viewer;
  }
  read(caller: Caller, chat: string, input: z.infer<typeof PREVIEW_LOG_READ>): PreviewLogPage {
    const viewer = this.select(caller, chat, input);
    return viewer.records.read(viewer.scope, PREVIEW_LOG_READ.parse(input), this.shared(viewer));
  }
  search(caller: Caller, chat: string, input: z.infer<typeof PREVIEW_LOG_SEARCH>): PreviewLogPage {
    const viewer = this.select(caller, chat, input);
    return viewer.records.read(
      viewer.scope,
      input,
      this.shared(viewer),
      PREVIEW_LOG_SEARCH.parse(input),
    );
  }
  async capture(
    caller: Caller,
    chat: string,
    input: z.infer<typeof PREVIEW_CAPTURE_SELECTOR>,
  ): Promise<z.infer<typeof PREVIEW_CAPTURE_RESULT>> {
    try {
      return await this.captureCurrent(caller, chat, input);
    } catch (cause) {
      if (!(cause instanceof ViewerReplacedError)) throw cause;
      return this.captureCurrent(caller, chat, input);
    }
  }
  private async captureCurrent(
    caller: Caller,
    chat: string,
    input: z.infer<typeof PREVIEW_CAPTURE_SELECTOR>,
  ): Promise<z.infer<typeof PREVIEW_CAPTURE_RESULT>> {
    const viewer = this.select(caller, chat, input);
    this.visibleFence(viewer);
    const pixels = await viewer.capture({
      requestId: randomUUID(),
      scope: viewer.scope,
      action: 'capture',
    });
    this.visibleFence(viewer);
    if (pixels === null)
      throw new ApiError('upstream_failed', 'The viewing device did not return image pixels.');
    return this.keepCapture(viewer, pixels);
  }
  private async keepCapture(
    viewer: Viewer,
    pixels: PreviewPixels,
  ): Promise<z.infer<typeof PREVIEW_CAPTURE_RESULT>> {
    const content = await captureBytes(pixels);
    const abort = new AbortController();
    const stop = onPreviewAuthorityChange(this.store, () => {
      try {
        this.captureFence(viewer);
      } catch (cause) {
        abort.abort(cause);
      }
    });
    try {
      const file = await this.assistant.files.keepBytes({
        profileId: viewer.scope.profileId,
        authorize: (): void => {
          this.captureFence(viewer);
        },
        name: 'preview.png',
        mime: pixels.mime,
        content,
        signal: abort.signal,
      });
      try {
        this.captureFence(viewer);
      } catch (cause) {
        await this.assistant.files.remove([file]);
        throw cause;
      }
      return {
        scope: viewer.scope,
        artifactId: file.id,
        width: pixels.width,
        height: pixels.height,
        scale: pixels.scale,
        capturedAt: pixels.capturedAt,
      };
    } finally {
      stop();
    }
  }
  async clear(
    caller: Caller,
    chat: string,
    input: z.infer<typeof PREVIEW_CAPTURE_SELECTOR> & {
      readonly action: 'clear-cache' | 'clear-cookies' | 'clear-storage';
    },
  ): Promise<{ ok: true }> {
    const viewer = this.select(caller, chat, input);
    this.captureFence(viewer);
    await viewer.capture({ requestId: randomUUID(), scope: viewer.scope, action: input.action });
    this.captureFence(viewer);
    return { ok: true };
  }
  private captureFence(viewer: Viewer): void {
    this.authority.validate(viewer.scope);
    if (this.viewers.get(diagnosticIdentity(viewer.scope)) !== viewer)
      throw new ViewerReplacedError();
  }
  private visibleFence(viewer: Viewer): void {
    this.captureFence(viewer);
    if (!viewer.visible)
      throw new ApiError(
        'conflict',
        'The browser pane is not on screen on the viewing device. Select its tab with edit_embedded_browser to show the pane while the person has this chat open, then capture again.',
      );
  }
  private admit(event: StoredEvent): boolean {
    const scope = this.wakes.get(event.id);
    if (scope === undefined) return !event.text.startsWith(PREVIEW_REPORT_PREFIX);
    const viewer = this.viewers.get(diagnosticIdentity(scope));
    try {
      if (viewer?.visible === true) {
        this.authority.validate(scope);
        return true;
      }
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause;
    }
    this.wakes.delete(event.id);
    return false;
  }
  private retirePrevious(scope: PreviewDiagnosticScope, close: () => void): void {
    for (const [key, viewer] of this.viewers) {
      if (
        viewer.scope.clientId === scope.clientId &&
        viewer.scope.viewerId === scope.viewerId &&
        key !== diagnosticIdentity(scope)
      ) {
        this.forget(key, viewer, viewer.close !== close);
        if (viewer.close !== close) viewer.close();
      }
    }
  }
  private forget(key: string, viewer: Viewer, retired: boolean): void {
    this.viewers.delete(key);
    if (retired) this.retiredConnections.add(viewer.close);
  }
  private retire(key: string, viewer: Viewer): void {
    this.forget(key, viewer, true);
    for (const [id, scope] of this.wakes) {
      if (diagnosticIdentity(scope) !== key) continue;
      this.wakes.delete(id);
      const event = this.store.assistantEvents.find(id);
      if (event?.delivered_at === null) this.store.assistantEvents.mark(event.id, 'answered_at');
    }
  }
  private revalidate(): void {
    for (const [key, viewer] of this.viewers) {
      try {
        this.authority.validate(viewer.scope);
      } catch (cause) {
        if (!(cause instanceof Error)) throw cause;
        this.retire(key, viewer);
        viewer.close();
      }
    }
  }
  stop(): void {
    this.stopFeed();
    for (const [key, viewer] of this.viewers) {
      this.retire(key, viewer);
      viewer.close();
    }
    this.stopAdmission();
  }
}

function matchingViewer(
  scope: PreviewDiagnosticScope,
  input: z.infer<typeof PREVIEW_CAPTURE_SELECTOR>,
): boolean {
  return (
    (input.viewerId === undefined || scope.viewerId === input.viewerId) &&
    (input.clientId === undefined || scope.clientId === input.clientId) &&
    (input.browserId === undefined || scope.browserId === input.browserId) &&
    (input.epoch === undefined || scope.epoch === input.epoch)
  );
}

async function captureBytes(pixels: PreviewPixels): Promise<Buffer> {
  const content = Buffer.from(pixels.dataBase64, 'base64');
  if (content.length === 0 || content.length > PREVIEW_CAPTURE_MAX_BYTES)
    throw new ApiError('invalid_request', 'Preview capture exceeds the image byte limit.');
  const dimensions = await imageSize(content);
  if (
    dimensions?.width !== pixels.width ||
    dimensions.height !== pixels.height ||
    dimensions.width * dimensions.height > 16_000_000
  )
    throw new ApiError(
      'invalid_request',
      'The captured image dimensions do not match its viewport metadata.',
    );
  return content;
}
