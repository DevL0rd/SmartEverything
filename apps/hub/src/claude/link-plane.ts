import type {
  ClaudeAnswer,
  ClaudePrompt,
  ClaudeControllerRegistration,
  ClaudeController,
  ClaudeUsage,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { ClaudeCli } from './claude-cli';
import { NativeTools } from './native-tools';
import type {
  ClaudeControlPlane,
  ClaudeControllerState,
  ClaudeLinkState,
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
import { LinkToken, type LinkCredential } from './link-token';
import { PromptBroker, type Requester } from './prompt-broker';
import { ModStreams, type StreamSink } from './streams';

export interface PlaneOptions {
  readonly store?: Store;
  readonly credential?: LinkCredential;
  readonly clock: Clock;
  readonly log: Logger;
  readonly directory: string;
  readonly launch: LinkLaunch;
  readonly cli: ClaudeCli;
  readonly readUrl: () => Promise<string>;
  readonly readMcp?: () => Promise<{
    readonly url: string | null;
    readonly headersCommand: string;
  }>;
  readonly pluginsDirectory: string;
  readonly raised: (prompt: ClaudePrompt) => void;
  readonly holdMs?: number;
  readonly riskyHoldMs?: number;
  readonly requestTimeoutMs?: number;
}

export class LinkPlane implements ClaudeControlPlane {
  readonly broker: PromptBroker;
  readonly streams: ModStreams;
  readonly native: NativeTools;
  readonly token: LinkCredential;
  private readonly pluginLink: ClaudeLink;
  private readonly listeners = new Set<() => void>();
  private readonly reported = new Set<string>();
  private problem: string | null = null;

  constructor(private readonly options: PlaneOptions) {
    const changed = (): void => {
      this.notify();
    };
    const { clock, log, directory, launch } = options;
    this.token = credentialOf(options);
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
    this.native = nativeTools(this.streams, directory, changed, log);
    this.pluginLink = new ClaudeLink({
      directory,
      launch,
      token: this.token,
      cli: options.cli,
      readUrl: options.readUrl,
      ...(options.readMcp === undefined ? {} : { readMcp: options.readMcp }),
      pluginsDirectory: options.pluginsDirectory,
      log,
      changed,
    });
  }

  async load(): Promise<void> {
    await this.pluginLink.refresh();
    this.notify();
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
    return 'not_registered';
  }

  prompts(): readonly ClaudePrompt[] {
    return this.broker.prompts();
  }

  sessionLink(sessionId: string): SessionLinkFacts {
    return {
      connected: this.streams.has(sessionId),
      reported: this.reported.has(sessionId),
    };
  }

  usage(): ClaudeUsage {
    return this.streams.usage();
  }

  configureControl(enabled: boolean): void {
    if (!enabled) {
      this.streams.stop();
      this.broker.stop();
    }
  }

  answer(promptId: string, body: ClaudeAnswer, requester: Requester): Promise<ClaudePrompt> {
    return Promise.resolve(this.broker.answer(promptId, body, requester));
  }

  async installLink(): Promise<{ state: ClaudeLinkState }> {
    const state = await this.pluginLink.install();
    this.setProblem(null);
    return { state };
  }

  removeLink(): Promise<{ state: ClaudeLinkState }> {
    return this.pluginLink.remove().then((state) => ({ state }));
  }

  registerController(): Promise<ClaudeControllerRegistration> {
    return Promise.reject(
      new ClaudeNotReadyError(
        'register_controller',
        'Desktop controller registration is retired. Use the owned CLI provider or attached CLI tools.',
      ),
    );
  }

  removeController(): Promise<ClaudeController> {
    return Promise.reject(
      new ClaudeNotReadyError(
        'remove_controller',
        'Desktop controller management is retired; existing files are retained.',
      ),
    );
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
        return NO_ANSWER;
      case 'Stop':
        return NO_ANSWER;
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
    if (this.native.permits(input.session_id, input.tool_name, input.tool_input)) {
      return NO_ANSWER;
    }
    this.options.log.warn('native.floor_denied', {
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

  attachStream(sessionId: string, sink: StreamSink, closed: AbortSignal, single = false): void {
    this.markReported(sessionId);
    this.streams.attach(sessionId, sink, closed, single);
    this.native.discover(sessionId);
  }

  report(report: ModReport): void {
    this.streams.report(report);
  }

  stop(): void {
    this.streams.stop();
    this.broker.stop();
    this.listeners.clear();
  }
}

function credentialOf(options: PlaneOptions): LinkCredential {
  if (options.credential !== undefined) {
    return options.credential;
  }
  if (options.store === undefined) {
    throw new ClaudeNotReadyError('link', 'a local scoped link credential is required');
  }
  return new LinkToken(options.store, options.directory);
}

function nativeTools(
  streams: ModStreams,
  directory: string,
  changed: () => void,
  log: Logger,
): NativeTools {
  return new NativeTools(streams, directory, changed, (cause): void => {
    log.error('native.discovery_failed', cause);
  });
}
