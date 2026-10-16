import { submitNativePrompt } from './native-prompt';
import { ProcessControls } from './controls';
import {
  prepareRuntimeConfiguration,
  configurationPreparationReceipt,
  isConfigurationPreparation,
} from './configuration-preparation';
import type { HarnessDispatcherOptions } from './dispatcher-options';
export type { HarnessDispatcherOptions } from './dispatcher-options';
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
import { ProcessStreams } from './streams';
import type { HarnessModelStreamEvent, HarnessOpenRequest } from './streams';
import { auxiliaryText, preflightRoute, admitRuntimeRoute } from './model-controls';
import { updateWorkspace } from './workspace';
import { updatePermission } from './permission';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { Context } from '@deepseek-ai/cordis';
import { HARNESS_RUNTIME_RECEIPT } from '@smarteverything/domain';
import type {
  HarnessRuntimeRequest,
  HarnessRuntimeReceipt,
  DshWriterClaim,
} from '@smarteverything/domain';
import { createHarnessRuntime } from '../host/runtime';
import type { HarnessRuntime } from '../host/runtime';
import type { HarnessSession } from '../host/session';
import { HarnessRuntimeError } from '../host/errors';
import { sessionOpenOptions } from './open-options';
import { ProcessProjection } from './projection';
import { ProcessInteractions } from './interactions';
type NativeOperationRequest = Exclude<
  HarnessRuntimeRequest,
  {
    kind:
      | 'open'
      | 'prompt'
      | 'auxiliary'
      | 'preflight'
      | 'command'
      | 'command_list'
      | 'compact'
      | 'configuration_prepare'
      | 'reference';
  }
>;
export type { HarnessAttachment } from './attachments';
export class HarnessDispatcher {
  private readonly openings = new ProcessOpenings();
  private readonly admission = new ProcessControls(
    () => this.runtime.configurationState().pendingRevision !== null,
  );
  private readonly closed: Map<string, DshWriterClaim>;
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
    return this.admission.execute(id, raw, (request) => this.run(id, request));
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
    await this.admission.shutdown(async (): Promise<void> => {
      await this.runtime.dispose();
      await this.ports.projection.flush();
    });
  }
  private async run(id: string, request: HarnessRuntimeRequest): Promise<HarnessRuntimeReceipt> {
    if (isConfigurationPreparation(request)) return this.prepareControl(id, request);
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
    if (request.kind === 'reference')
      return {
        ...(await this.receipt(id, request.session_id, claim.epoch, 'completed')),
        references: await this.runtime.referenceOperation(request.session_id, request.input),
      };
    if (request.kind === 'auxiliary') return this.auxiliary(id, request);
    if (request.kind === 'prompt') {
      await this.ports.projection.flush(request.session_id);
      await submitNativePrompt(this.runtime, session, request, {
        ctx: this.ports.ctx,
        options: this.options,
      });
      return this.receipt(id, request.session_id, claim.epoch, 'accepted');
    }
    await this.operation(session, request, id);
    if (request.kind === 'close') this.closed.set(request.session_id, claim);
    await this.ports.projection.flush(request.session_id);
    return this.receipt(id, request.session_id, claim.epoch, lifecycleReceipt(request.kind));
  }
  private prepareControl(
    id: string,
    request: Extract<
      HarnessRuntimeRequest,
      { kind: 'open' | 'preflight' | 'configuration_prepare' }
    >,
  ): Promise<HarnessRuntimeReceipt> {
    switch (request.kind) {
      case 'open':
        return this.openings.run(id, request, () => this.open(id, request));
      case 'preflight':
        return this.preflight(id, request);
      case 'configuration_prepare':
        return this.prepareReceipt(id, request);
    }
  }
  private async prepareReceipt(
    id: string,
    request: Extract<HarnessRuntimeRequest, { kind: 'configuration_prepare' }>,
  ): Promise<HarnessRuntimeReceipt> {
    const claim = this.options.persistence.boundClaim(request.session_id);
    return configurationPreparationReceipt(id, request, claim, () =>
      this.prepareConfiguration(request.protected_sessions),
    );
  }
  private prepareConfiguration(protectedSessions: readonly string[]): Promise<void> {
    return prepareRuntimeConfiguration(
      this.runtime,
      this.options.persistence,
      async (id): Promise<void> => {
        await this.closeNative(this.runtime.get(id), id);
      },
      protectedSessions,
    );
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
