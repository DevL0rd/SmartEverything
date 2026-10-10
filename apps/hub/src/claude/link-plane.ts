import type {
  ClaudeAnswer,
  ClaudeControl,
  ClaudeDelivery,
  ClaudePrompt,
  ClaudeStart,
  ClaudeUsage,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { ClaudeCli } from './claude-cli';
import { ClaudeController } from './controller';
import { ClaudeControls, type OpenUrl } from './control';
import type {
  ClaudeControlPlane,
  ClaudeControllerState,
  ClaudeLinkState,
  ControlTarget,
  SessionLinkFacts,
} from './control-plane';
import {
  NO_ANSWER,
  type FloorInput,
  type HookInput,
  type HookOutput,
  type ModReport,
  type ObservedInput,
} from './hook-events';
import { ClaudeNotReadyError } from './errors';
import { floorDenied } from './hook-output';
import { ClaudeLink } from './link';
import type { LinkLaunch } from './link-launch';
import { LinkToken } from './link-token';
import { PromptBroker, type Requester } from './prompt-broker';
import { ModStreams, type StreamSink } from './streams';

export interface PlaneOptions {
  readonly store: Store;
  readonly clock: Clock;
  readonly log: Logger;
  readonly directory: string;
  readonly launch: LinkLaunch;
  readonly cli: ClaudeCli;
  readonly readUrl: () => Promise<string>;
  readonly pluginsDirectory: string;
  readonly open: OpenUrl;
  readonly raised: (prompt: ClaudePrompt) => void;
  readonly autoInstall: () => boolean;
  readonly holdMs?: number;
  readonly riskyHoldMs?: number;
  readonly requestTimeoutMs?: number;
  readonly pickupMs?: number;
}

export class LinkPlane implements ClaudeControlPlane {
  readonly broker: PromptBroker;
  readonly streams: ModStreams;
  readonly token: LinkToken;
  private readonly pluginLink: ClaudeLink;
  private readonly controllerSession: ClaudeController;
  private readonly controls: ClaudeControls;
  private readonly listeners = new Set<() => void>();
  private readonly reported = new Set<string>();
  private problem: string | null = null;

  constructor(private readonly options: PlaneOptions) {
    const changed = (): void => {
      this.notify();
    };
    const { clock, log, directory, launch } = options;
    this.token = new LinkToken(options.store, directory);
    this.broker = new PromptBroker({
      clock,
      log,
      changed,
      raised: options.raised,
      ...(options.holdMs === undefined ? {} : { holdMs: options.holdMs }),
      ...(options.riskyHoldMs === undefined ? {} : { riskyHoldMs: options.riskyHoldMs }),
    });
    this.streams = new ModStreams({
      clock,
      log,
      changed,
      ...(options.requestTimeoutMs === undefined ? {} : { timeoutMs: options.requestTimeoutMs }),
    });
    this.controllerSession = new ClaudeController({ clock, log, directory, launch, changed });
    this.pluginLink = new ClaudeLink({
      directory,
      launch,
      token: this.token,
      cli: options.cli,
      readUrl: options.readUrl,
      pluginsDirectory: options.pluginsDirectory,
      log,
      changed,
    });
    this.controls = new ClaudeControls({
      streams: this.streams,
      controller: this.controllerSession,
      open: options.open,
      log,
      ...(options.pickupMs === undefined ? {} : { pickupMs: options.pickupMs }),
    });
  }

  async load(): Promise<void> {
    await this.controllerSession.load();
    await this.pluginLink.refresh();
    this.notify();
    if (this.options.autoInstall()) {
      await this.autoInstallLink();
    }
  }

  private async autoInstallLink(): Promise<void> {
    const { log } = this.options;
    const before = this.pluginLink.state();
    try {
      const after = await this.pluginLink.install();
      this.setProblem(null);
      log.info(before === 'installed' ? 'link.auto_current' : 'link.auto_installed', {
        from: before,
        state: after,
      });
    } catch (cause) {
      if (cause instanceof ClaudeNotReadyError) {
        log.info('link.auto_skipped', { reason: cause.reason });
        return;
      }
      this.setProblem(cause instanceof Error ? cause.message : String(cause));
      log.error('link.auto_failed', cause);
    }
  }

  private setProblem(next: string | null): void {
    if (next !== this.problem) {
      this.problem = next;
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  link(): ClaudeLinkState {
    return this.pluginLink.state();
  }

  linkProblem(): string | null {
    return this.problem;
  }

  controller(): ClaudeControllerState {
    return this.controllerSession.state();
  }

  prompts(): readonly ClaudePrompt[] {
    return this.broker.prompts();
  }

  sessionLink(sessionId: string): SessionLinkFacts {
    return { connected: this.streams.has(sessionId), reported: this.reported.has(sessionId) };
  }

  usage(): ClaudeUsage {
    return this.streams.usage();
  }

  control(target: ControlTarget, body: ClaudeControl): Promise<ClaudeDelivery | null> {
    return this.controls.control(target, body);
  }

  answer(promptId: string, body: ClaudeAnswer, requester: Requester): Promise<ClaudePrompt> {
    return Promise.resolve(this.broker.answer(promptId, body, requester));
  }

  start(body: ClaudeStart): ReturnType<ClaudeControls['start']> {
    return this.controls.start(body);
  }

  async installLink(): Promise<{ state: ClaudeLinkState }> {
    const state = await this.pluginLink.install();
    this.setProblem(null);
    return { state };
  }

  removeLink(): Promise<{ state: ClaudeLinkState }> {
    return this.pluginLink.remove().then((state) => ({ state }));
  }

  registerController(): ReturnType<ClaudeController['begin']> {
    return this.controllerSession.begin();
  }

  async removeController(): Promise<{ state: ClaudeControllerState }> {
    await this.controllerSession.forget();
    return { state: this.controllerSession.state() };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async hook(input: HookInput, closed: AbortSignal): Promise<HookOutput> {
    this.markReported(input.session_id);
    switch (input.hook_event_name) {
      case 'UserPromptSubmit':
        await this.controllerSession.prompted(input.session_id, input.prompt);
        return NO_ANSWER;
      case 'Stop':
        return this.controllerSession.stopped(
          input.session_id,
          input.last_assistant_message ?? '',
          closed,
        );
      case 'PermissionRequest':
      case 'PreToolUse':
        return this.broker.hold(
          {
            sessionId: input.session_id,
            event: input.hook_event_name,
            toolName: input.tool_name,
            input: input.tool_input,
            cwd: input.cwd ?? null,
          },
          closed,
        );
    }
  }

  observed(input: ObservedInput): void {
    this.markReported(input.session_id);
    this.options.log.info('hook.seen', {
      event: input.hook_event_name,
      session: input.session_id,
    });
  }

  floor(input: FloorInput): HookOutput {
    if (this.controllerSession.permits(input.session_id, input.tool_name, input.tool_input)) {
      return NO_ANSWER;
    }
    this.options.log.warn('controller.floor_denied', {
      session: input.session_id,
      tool: input.tool_name,
    });
    return floorDenied();
  }

  private markReported(sessionId: string): void {
    if (!this.reported.has(sessionId)) {
      this.reported.add(sessionId);
      this.notify();
    }
  }

  attachStream(sessionId: string, sink: StreamSink, closed: AbortSignal): void {
    this.markReported(sessionId);
    this.streams.attach(sessionId, sink, closed);
  }

  report(report: ModReport): void {
    this.streams.report(report);
  }
}
