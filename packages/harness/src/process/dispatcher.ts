import type { NativeMediaNote } from './native-media-note';
import { isNativeCommandRequest, nativeCommandReceipt } from './commands';
import { runtimeReceipt } from './receipts';
import { importLegacyHistory } from './legacy-history';
import { verifyNativeAttachments } from './attachment-preflight';
import { ProcessOpenings, openIdentity } from './openings';
import { ProcessChildren } from './children';
import {
  cleanupUnopened,
  requireCleanupIdentity,
  nativeSessionPresent,
  lifecycleReceipt,
  cleanupFailedOpen,
} from './cleanup';
import { installDispatcherModels } from './model-installation';
import { nativePromptContent } from './prompt-content';
import type { HarnessAttachment } from './attachments';
import { ProcessStreams } from './streams';
import type { HarnessModelStreamEvent, HarnessOpenRequest } from './streams';
import { auxiliaryText, preflightRoute, admitRuntimeRoute } from './model-controls';
import { createHash } from 'node:crypto';
import { updateWorkspace } from './workspace';
import { updatePermission } from './permission';
import { MessageId, createUserMessage } from '@deepseek-ai/dsh-llm';
import type { Context } from '@deepseek-ai/cordis';
import { HARNESS_RUNTIME_REQUEST, HARNESS_RUNTIME_RECEIPT } from '@smarteverything/domain';
import type {
  HarnessRuntimeRequest,
  HarnessRuntimeReceipt,
  AiModelRoute,
  AiHarnessEvent,
  DshWriterClaim,
} from '@smarteverything/domain';
import { createHarnessRuntime } from '../host/runtime';
import type { HarnessRuntime, HarnessRuntimeOptions } from '../host/runtime';
import type { HarnessSession } from '../host/session';
import type { HarnessAuthority } from '../host/server-policy';
import { HarnessRuntimeError } from '../host/errors';
import { sessionOpenOptions } from './open-options';
import { ProcessProjection } from './projection';
import { ProcessInteractions } from './interactions';
import type { HarnessControlPersistence } from './contracts';

type NativeOperationRequest = Exclude<
  HarnessRuntimeRequest,
  { kind: 'open' | 'prompt' | 'auxiliary' | 'preflight' | 'command' | 'command_list' }
>;
export type { HarnessAttachment } from './attachments';
export interface HarnessDispatcherOptions extends Pick<
  HarnessRuntimeOptions,
  | 'host'
  | 'desiredConfiguration'
  | 'installedPlugins'
  | 'configurationChanged'
  | 'serverToolAccess'
  | 'projectFiles'
> {
  readonly configurationPending?: NonNullable<HarnessRuntimeOptions['configurationPending']>;
  readonly persistence: HarnessControlPersistence;
  readonly installModelRoutes: (ctx: Context) => Promise<void>;
  readonly publish: (event: AiHarnessEvent) => Promise<void>;
  readonly route: (id: string) => AiModelRoute;
  readonly loadAttachments?: (
    sessionId: string,
    ids: readonly string[],
  ) => AsyncIterable<HarnessAttachment>;
  readonly describeImage?: NativeMediaNote;
  readonly authority?: (id: string) => HarnessAuthority;
}
export class HarnessDispatcher {
  private readonly openings = new ProcessOpenings();
  private readonly closed: Map<string, DshWriterClaim>;
  private readonly receipts = new Map<
    string,
    { readonly signature: string; readonly result: Promise<HarnessRuntimeReceipt> }
  >();
  constructor(
    readonly runtime: HarnessRuntime,
    private readonly options: HarnessDispatcherOptions,
    private readonly ports: {
      readonly projection: ProcessProjection;
      readonly interactions: ProcessInteractions;
      readonly ctx: Context;
      readonly streams: ProcessStreams;
      readonly opened: Map<string, HarnessOpenRequest>;
      readonly children: ProcessChildren;
      readonly closed: Map<string, DshWriterClaim>;
    },
  ) {
    this.closed = ports.closed;
  }
  execute(id: string, raw: HarnessRuntimeRequest): Promise<HarnessRuntimeReceipt> {
    const request = HARNESS_RUNTIME_REQUEST.parse(raw);
    const signature = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const existing = this.receipts.get(id);
    if (existing !== undefined) {
      if (existing.signature !== signature)
        throw new HarnessRuntimeError(
          'operation_failed',
          'Operation identity was reused with different input.',
        );
      return existing.result;
    }
    const result = this.run(id, request).catch((cause: unknown) => {
      if (request.kind === 'close' || request.kind === 'permission') this.receipts.delete(id);
      throw cause;
    });
    this.receipts.set(id, { signature, result });
    return result;
  }
  hasSession(id: string, epoch: number): boolean {
    return (
      this.ports.opened.get(id)?.claim.epoch === epoch &&
      this.options.persistence.boundClaim(id)?.epoch === epoch &&
      nativeSessionPresent(this.runtime, id)
    );
  }
  async observeStream(
    input: { readonly session_id: string; readonly expected_epoch: number },
    listener: (event: HarnessModelStreamEvent) => void,
  ): Promise<() => void> {
    this.runtime.get(input.session_id);
    return this.ports.streams.observe(input, listener);
  }
  async dispose(): Promise<void> {
    await this.runtime.dispose();
    await this.ports.projection.flush();
  }
  private async run(id: string, request: HarnessRuntimeRequest): Promise<HarnessRuntimeReceipt> {
    if (request.kind === 'open')
      return this.openings.run(id, request, () => this.open(id, request));
    if (request.kind === 'preflight') return this.preflight(id, request);
    if (request.kind === 'close') {
      const closed = await this.cleanup(id, request);
      if (closed !== undefined) return closed;
    }
    const claim = this.options.persistence.claim(request.session_id);
    if (claim.epoch !== request.expected_epoch)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'This control belongs to another native writer epoch.',
      );
    await this.options.persistence.verify(claim);
    const session = this.runtime.get(request.session_id);
    if (isNativeCommandRequest(request))
      return nativeCommandReceipt(
        session,
        request,
        () => this.receipt(id, request.session_id, claim.epoch, 'completed'),
        () => this.ports.projection.flush(request.session_id),
      );
    if (request.kind === 'auxiliary') return this.auxiliary(id, request);
    if (request.kind === 'prompt') {
      await this.prompt(session, request);
      return this.receipt(id, request.session_id, claim.epoch, 'accepted');
    }
    await this.operation(session, request, id);
    if (request.kind === 'close') this.closed.set(request.session_id, claim);
    await this.ports.projection.flush(request.session_id);
    return this.receipt(id, request.session_id, claim.epoch, lifecycleReceipt(request.kind));
  }
  private async cleanup(
    id: string,
    request: Extract<HarnessRuntimeRequest, { kind: 'close' }>,
  ): Promise<HarnessRuntimeReceipt | undefined> {
    const closed = this.closed.get(request.session_id);
    if (closed?.epoch === request.expected_epoch) {
      requireCleanupIdentity(closed, request.claim);
      return this.receipt(id, request.session_id, request.expected_epoch, 'closed');
    }
    if (this.ports.opened.has(request.session_id)) return undefined;
    if (nativeSessionPresent(this.runtime, request.session_id))
      throw new HarnessRuntimeError(
        'source_outcome_unknown',
        'Cleanup found a native Agent without its admitted control binding; normal drain/close must settle it.',
      );
    const claim = await cleanupUnopened(request, this.options.persistence, this.options.host);
    this.closed.set(request.session_id, claim);
    return this.receipt(id, request.session_id, request.expected_epoch, 'closed');
  }
  private async prompt(
    session: HarnessSession,
    request: Extract<HarnessRuntimeRequest, { kind: 'prompt' }>,
  ): Promise<void> {
    await this.ports.projection.flush(request.session_id);
    const content = await nativePromptContent(this.runtime, request, {
      ctx: this.ports.ctx,
      load: this.options.loadAttachments,
    });
    const message = createUserMessage({ content, source: { kind: 'user' } });
    session.prompt({ ...message, id: MessageId(request.delivery_id) });
  }
  private async operation(
    session: HarnessSession,
    request: NativeOperationRequest,
    id: string,
  ): Promise<void> {
    switch (request.kind) {
      case 'permission':
        await updatePermission(session, request, id, {
          host: this.options.host,
          opened: this.ports.opened,
          projection: this.ports.projection,
        });
        return;
      case 'steer':
        session.steer(
          createUserMessage({
            content: [{ type: 'text', text: request.text }],
            source: { kind: 'user' },
          }),
        );
        return;
      case 'interrupt':
        await this.ports.children.settle(request.session_id, 'interrupt');
        await session.interrupt();
        return;
      case 'compact':
        await session.compact();
        return;
      case 'answer':
        this.ports.interactions.answer(request.session_id, request.answer);
        return;
      case 'drain':
        await this.ports.children.settle(request.session_id, 'drain');
        await session.drain();
        return;
      case 'close':
        await this.closeNative(session, request.session_id);
        return;
      case 'workspace':
        await updateWorkspace(this.runtime, this.options.host, request.session_id, request.choice);
        this.ports.projection.deviceWorkspace(
          request.session_id,
          this.runtime.storageBinding(request.session_id),
        );
        return;
    }
  }
  private async closeNative(session: HarnessSession, id: string): Promise<void> {
    await this.ports.children.settle(id, 'close');
    await session.drain();
    await this.ports.projection.flush(id);
    this.ports.projection.close(id);
    await this.runtime.close(id);
    this.ports.opened.delete(id);
    this.ports.children.closed(id);
  }
  private async auxiliary(
    id: string,
    input: Extract<HarnessRuntimeRequest, { kind: 'auxiliary' }>,
  ): Promise<HarnessRuntimeReceipt> {
    const opening = this.ports.opened.get(input.session_id);
    if (opening === undefined)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Auxiliary requests require a currently opened native conversation.',
      );
    const text = await auxiliaryText(this.ports.ctx, opening.route, input);
    return {
      ...(await this.receipt(id, input.session_id, input.expected_epoch, 'completed')),
      text,
    };
  }
  private async preflight(
    id: string,
    input: Extract<HarnessRuntimeRequest, { kind: 'preflight' }>,
  ): Promise<HarnessRuntimeReceipt> {
    admitRuntimeRoute(input.route, this.options.route);
    await preflightRoute(this.ports.ctx, input);
    await verifyNativeAttachments(this.ports.ctx, input.native_attachments ?? []);
    return HARNESS_RUNTIME_RECEIPT.parse({
      operation_id: id,
      session_id: input.session_id,
      epoch: input.expected_epoch,
      state: 'preflighted',
      durable_seq: -1,
    });
  }
  private async open(
    id: string,
    input: Extract<HarnessRuntimeRequest, { kind: 'open' }>,
  ): Promise<HarnessRuntimeReceipt> {
    const target = this.options.host.target;
    if (JSON.stringify(input.claim.target) !== JSON.stringify(target))
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Native session claim names another execution host.',
      );
    admitRuntimeRoute(input.route, this.options.route);
    const existing = await this.openRetry(id, input);
    if (existing !== undefined) return existing;
    const metadata = await this.options.persistence.metadata(input.claim.session_id);
    if (metadata.chat_id !== input.chat_id)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Native session belongs to another shared conversation.',
      );
    this.options.persistence.bind(input.claim);
    await this.options.persistence.verify(input.claim);
    const authority = this.options.authority?.(input.claim.session_id);
    try {
      await importLegacyHistory(this.runtime, input, {
        persistence: this.options.persistence,
        load: this.options.loadAttachments,
      });
      await this.ports.projection.open(input);
      this.ports.opened.set(input.claim.session_id, input);
      await this.runtime.resume(sessionOpenOptions(input, authority));
    } catch (cause) {
      this.ports.opened.delete(input.claim.session_id);
      this.ports.projection.close(input.claim.session_id);
      await cleanupFailedOpen(input.claim, this.runtime, this.options.persistence);
      this.closed.set(input.claim.session_id, input.claim);
      throw cause;
    }
    await this.ports.children.opened(input.claim.session_id);
    return this.receipt(id, input.claim.session_id, input.claim.epoch, 'ready');
  }
  private async openRetry(
    id: string,
    input: HarnessOpenRequest,
  ): Promise<HarnessRuntimeReceipt | undefined> {
    const existing = this.ports.opened.get(input.claim.session_id);
    if (existing !== undefined) {
      if (openIdentity(existing) !== openIdentity(input))
        throw new HarnessRuntimeError(
          'ownership_lost',
          'Open retry does not match the admitted native binding.',
        );
      await this.options.persistence.verify(input.claim);
      return this.receipt(id, input.claim.session_id, input.claim.epoch, 'ready');
    }
    return undefined;
  }
  private async receipt(
    id: string,
    sessionId: string,
    epoch: number,
    state: HarnessRuntimeReceipt['state'],
  ): Promise<HarnessRuntimeReceipt> {
    return runtimeReceipt(this.options.persistence, id, sessionId, { epoch, state });
  }
}
export async function createHarnessDispatcher(
  options: HarnessDispatcherOptions,
): Promise<HarnessDispatcher> {
  const projection = new ProcessProjection(options.persistence, options.publish, (id) =>
    interactions.pendingFor(id),
  );
  const interactions: ProcessInteractions = new ProcessInteractions(
    (id) => options.persistence.claim(id).epoch,
    projection.interaction,
  );
  const opened = new Map<string, HarnessOpenRequest>();
  const streams = new ProcessStreams(options.persistence, opened);
  let modelContext: Context | undefined;
  const childPort: { current: ProcessChildren | undefined } = { current: undefined };
  const runtime = await createHarnessRuntime({
    ...options,
    interactions,
    beforeStep: (id) => projection.admit(id),
    onEvent: (event): void => {
      if (event.kind === 'stream') streams.event(event);
      projection.event(event);
      childPort.current?.event(event);
    },
    installModelRoutes: async (ctx): Promise<void> => {
      modelContext = await installDispatcherModels(ctx, options);
    },
  });
  const closed = new Map<string, DshWriterClaim>();
  const children = new ProcessChildren(runtime, options.persistence, {
    projection,
    opened,
    closed,
  });
  childPort.current = children;
  if (modelContext === undefined)
    throw new HarnessRuntimeError(
      'runtime_unavailable',
      'Native model services did not finish installation.',
    );
  return new HarnessDispatcher(runtime, options, {
    projection,
    interactions,
    ctx: modelContext,
    streams,
    opened,
    children,
    closed,
  });
}
