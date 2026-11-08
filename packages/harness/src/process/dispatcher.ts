import { settledFailureContext } from './failure-context';
import { bindHelperWriter } from './helper-writer';
import { HelperPromptDeliveries } from './helper-prompt';
import { submitNativePrompt } from './native-prompt';
import { ProcessControls } from './controls';
import { controlChild } from './child-control';
import type { HarnessDispatcherOptions } from './dispatcher-options';
export type { HarnessDispatcherOptions } from './dispatcher-options';
import { isNativeCommandRequest, nativeCommandReceipt } from './commands';
import { runtimeReceipt } from './receipts';
import { ProcessOpenings, openIdentity } from './openings';
import { ProcessChildren } from './children';
import {
  nativeSessionPresent,
  lifecycleReceipt,
  cleanupFailedOpen,
  retireSession,
} from './cleanup';
import { installDispatcherModels } from './model-installation';
import { auxiliaryText, admitRuntimeRoute } from './model-controls';
import { updateWorkspace } from './workspace';
import { updatePermission } from './permission';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import {
  epochMismatch,
  openReused,
  openSuperseding,
  openUnwinding,
  traced,
} from './dispatch-trace';
import type { Context } from '@deepseek-ai/cordis';
import { harnessTargetKey } from '@smarteverything/domain';
import type { HarnessRuntimeRequest, HarnessRuntimeReceipt } from '@smarteverything/domain';
import { createHarnessRuntime } from '../host/runtime';
import type { HarnessRuntime } from '../host/runtime';
import type { HarnessSession } from '../host/session';
import { HarnessRuntimeError } from '../host/errors';
import { sessionOpenOptions } from './open-options';
import { NativeForward } from './native-forward';
import { ProcessInteractions } from './interactions';
type NativeOperationRequest = Exclude<
  HarnessRuntimeRequest,
  {
    kind: 'open' | 'prompt' | 'auxiliary' | 'command' | 'command_list' | 'compact' | 'reference';
  }
>;
export type { HarnessAttachment } from './attachments';
export type HarnessOpenRequest = Extract<HarnessRuntimeRequest, { kind: 'open' }>;
export class HarnessDispatcher {
  private readonly openings = new ProcessOpenings();
  private readonly admission = new ProcessControls();
  private readonly helperPrompts = new HelperPromptDeliveries();
  constructor(
    readonly runtime: HarnessRuntime,
    private readonly options: HarnessDispatcherOptions,
    private readonly ports: {
      readonly forward: NativeForward;
      readonly interactions: ProcessInteractions;
      readonly ctx: Context;
      readonly opened: Map<string, HarnessOpenRequest>;
      readonly children: ProcessChildren;
    },
  ) {}
  execute(id: string, raw: HarnessRuntimeRequest): Promise<HarnessRuntimeReceipt> {
    return this.admission.execute(id, raw, (request) =>
      traced(id, request, () => this.run(id, request)),
    );
  }
  hasSession(id: string, epoch: number): boolean {
    if (this.options.persistence.boundClaim(id)?.epoch !== epoch) return false;
    return (
      this.ports.children.isLive(id) ||
      (this.ports.opened.get(id)?.claim.epoch === epoch && nativeSessionPresent(this.runtime, id))
    );
  }
  async loseSession(id: string, epoch: number): Promise<void> {
    if (this.options.persistence.boundClaim(id)?.epoch !== epoch) return;
    this.options.persistence.lose(id);
    await this.runtime.whenOwnershipLossSettled(id);
  }
  async dispose(): Promise<void> {
    await this.admission.shutdown(async (): Promise<void> => {
      this.ports.forward.seal();
      await this.retireOpenPublications();
      await this.runtime.dispose();
      await this.retireOpenPublications();
    });
  }
  private async retireOpenPublications(): Promise<void> {
    for (const id of this.ports.forward.openIds()) await this.retirePublication(id);
  }
  private async retirePublication(id: string): Promise<void> {
    await this.ports.forward.flush(id);
    this.ports.forward.close(id);
    await this.ports.forward.flush(id);
  }
  private async run(id: string, request: HarnessRuntimeRequest): Promise<HarnessRuntimeReceipt> {
    if (request.kind === 'open')
      return this.openings.run(id, request, () => this.open(id, request));
    const child = this.ports.children.liveAgent(request.session_id);
    if (
      request.kind === 'close' &&
      child === undefined &&
      !this.ports.opened.has(request.session_id)
    )
      return this.closeUnopened(id, request);
    const claim = this.options.persistence.claim(request.session_id);
    epochMismatch(id, request, claim.epoch);
    if (claim.epoch !== request.expected_epoch)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'This control belongs to another native writer epoch.',
      );
    if (request.kind === 'prompt' && request.helper_parent !== undefined) {
      if (this.ports.opened.has(request.session_id))
        throw new HarnessRuntimeError(
          'ownership_lost',
          'This chat is open outside the original helper continuation.',
          request.session_id,
        );
      await this.helperPrompts.deliver(request, {
        ctx: this.ports.ctx,
        persistence: this.options.persistence,
        forward: this.ports.forward,
        runtime: this.runtime,
        load: this.options.loadAttachments,
      });
      return this.receipt(id, request.session_id, request.expected_epoch, 'accepted');
    }
    if (child !== undefined)
      return controlChild(id, request, child, {
        ...this.ports,
        runtime: this.runtime,
        options: this.options,
      });
    return this.runAttached(id, request, this.runtime.get(request.session_id));
  }
  private async runAttached(
    id: string,
    request: Exclude<HarnessRuntimeRequest, { kind: 'open' }>,
    session: HarnessSession,
  ): Promise<HarnessRuntimeReceipt> {
    if (isNativeCommandRequest(request))
      return nativeCommandReceipt(
        session,
        request,
        () => this.receipt(id, request.session_id, request.expected_epoch, 'completed'),
        () => this.ports.forward.flush(request.session_id),
      );
    if (request.kind === 'reference')
      return {
        ...(await this.receipt(id, request.session_id, request.expected_epoch, 'completed')),
        references: await this.runtime.referenceOperation(request.session_id, request.input),
      };
    if (request.kind === 'auxiliary') return this.auxiliary(id, request);
    if (request.kind === 'prompt') {
      await this.ports.forward.flush(request.session_id);
      await submitNativePrompt(this.runtime, session, request, {
        ctx: this.ports.ctx,
        options: this.options,
      });
      return this.receipt(id, request.session_id, request.expected_epoch, 'accepted');
    }
    await this.operation(session, request, id);
    await this.ports.forward.flush(request.session_id);
    const receipt = await this.receipt(
      id,
      request.session_id,
      request.expected_epoch,
      lifecycleReceipt(request.kind),
    );
    return request.kind === 'interrupt'
      ? { ...receipt, interactions: this.ports.interactions.takeCancelled(request.session_id) }
      : receipt;
  }
  private closeUnopened(
    id: string,
    request: Extract<HarnessRuntimeRequest, { kind: 'close' }>,
  ): Promise<HarnessRuntimeReceipt> {
    if (nativeSessionPresent(this.runtime, request.session_id))
      throw new HarnessRuntimeError(
        'source_outcome_unknown',
        'Close found a native Agent without its admitted control binding; normal close must settle it.',
      );
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
          forward: this.ports.forward,
        });
        return;
      case 'steer':
      case 'note':
        session[request.kind](
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
      case 'close':
        await this.closeNative(session, request.session_id);
        return;
      case 'workspace':
        await updateWorkspace(this.runtime, this.options.host, request.session_id, request.choice);
        this.deviceWorkspace(request.session_id);
        return;
    }
  }
  private deviceWorkspace(id: string): void {
    const binding = this.runtime.storageBinding(id);
    if (binding !== undefined) this.ports.forward.workspace(id, binding);
  }
  private async closeNative(session: HarnessSession, id: string): Promise<void> {
    await this.ports.children.settle(id, 'close');
    await session.drain();
    await this.ports.forward.flush(id);
    this.ports.forward.close(id);
    await this.runtime.close(id);
    this.options.persistence.lose(id);
    this.ports.interactions.forget(id);
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
  private async open(
    id: string,
    input: Extract<HarnessRuntimeRequest, { kind: 'open' }>,
  ): Promise<HarnessRuntimeReceipt> {
    const target = this.options.host.target;
    if (harnessTargetKey(input.claim.target) !== harnessTargetKey(target))
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Native session claim names another execution host.',
      );
    admitRuntimeRoute(input.route, this.options.route);
    if (input.mode === 'continue') {
      await bindHelperWriter(input, {
        ctx: this.ports.ctx,
        persistence: this.options.persistence,
        opened: this.ports.opened,
      });
      return this.receipt(id, input.claim.session_id, input.claim.epoch, 'ready');
    }
    const existing = await this.settleExisting(id, input);
    if (existing !== undefined) {
      openReused(id, input.claim.session_id, input.claim.epoch);
      return existing;
    }
    const metadata = await this.options.persistence.metadata(input.claim.session_id);
    if (metadata.chat_id !== input.chat_id)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'Native session belongs to another shared conversation.',
      );
    this.options.persistence.bind(input.claim);
    const authority = this.options.authority?.(input.claim.session_id);
    try {
      await this.ports.forward.open(input);
      this.ports.opened.set(input.claim.session_id, input);
      await this.runtime.resume(sessionOpenOptions(input, authority));
    } catch (cause) {
      openUnwinding(id, input.claim.session_id, cause);
      this.ports.opened.delete(input.claim.session_id);
      this.ports.forward.close(input.claim.session_id);
      await cleanupFailedOpen(input.claim, this.runtime, this.options.persistence);
      throw cause;
    }
    await this.ports.children.opened(input.claim.session_id);
    this.reask(input);
    return this.receipt(id, input.claim.session_id, input.claim.epoch, 'ready');
  }
  private reask(input: HarnessOpenRequest): void {
    if (input.interactions === undefined) return;
    const session = this.runtime.get(input.claim.session_id);
    this.ports.interactions.restore(input.claim.session_id, input.interactions, (text) => {
      session.steer(
        createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
      );
    });
  }
  private async settleExisting(
    id: string,
    input: HarnessOpenRequest,
  ): Promise<HarnessRuntimeReceipt | undefined> {
    const session = input.claim.session_id;
    const existing = this.ports.opened.get(session);
    if (existing === undefined) return undefined;
    if (existing.claim.epoch > input.claim.epoch)
      throw new HarnessRuntimeError(
        'ownership_lost',
        'This machine already holds a newer attachment of the session.',
      );
    if (existing.claim.epoch === input.claim.epoch) {
      if (openIdentity(existing) !== openIdentity(input))
        throw new HarnessRuntimeError(
          'ownership_lost',
          'Open retry does not match the admitted native binding.',
        );
      return this.receipt(id, session, input.claim.epoch, 'ready');
    }
    openSuperseding(session, existing.claim.epoch, input.claim.epoch);
    await retireSession(this.runtime, this.options.persistence, session);
    this.ports.forward.close(session);
    this.ports.opened.delete(session);
    this.ports.children.closed(session);
    return undefined;
  }
  private receipt(
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
  const forward = new NativeForward(options.publish, (id) => interactions.pendingFor(id));
  const interactions: ProcessInteractions = new ProcessInteractions(
    (id) => options.persistence.claim(id).epoch,
    forward.interaction,
  );
  const opened = new Map<string, HarnessOpenRequest>();
  let modelContext: Context | undefined;
  const childPort: { current: ProcessChildren | undefined } = { current: undefined };
  const runtime = await createHarnessRuntime({
    ...options,
    attachmentTransfer: options.loadAttachments !== undefined,
    interactions,
    beforeStep: (id) => forward.admit(id),
    failureContext: settledFailureContext(forward, options.failureContext),
    onEvent: (event): void => {
      forward.event(event);
      childPort.current?.event(event);
    },
    installModelRoutes: async (ctx): Promise<void> => {
      modelContext = await installDispatcherModels(ctx, options);
    },
  });
  if (modelContext === undefined)
    throw new HarnessRuntimeError(
      'runtime_unavailable',
      'Native model services did not finish installation.',
    );
  const children = new ProcessChildren(runtime, options.persistence, {
    forward,
    opened,
    ctx: modelContext,
  });
  childPort.current = children;
  return new HarnessDispatcher(runtime, options, {
    forward,
    interactions,
    ctx: modelContext,
    opened,
    children,
  });
}
