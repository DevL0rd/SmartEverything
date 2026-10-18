import type { ClaudeMcpServers, ProviderTurn } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';

export class JobLog {
  private readonly emitted = new Map<string, number>();
  private readonly createdAt = performance.now();

  constructor(
    private readonly log: Logger,
    private readonly turn: () => ProviderTurn,
    private readonly session: () => string,
  ) {}

  private ids(): Record<string, string> {
    const turn = this.turn();
    return { jobId: turn.job_id, chatId: turn.chat_id, sessionId: this.session() };
  }

  private counts(): Record<string, number> {
    return Object.fromEntries(this.emitted);
  }

  total(): number {
    let total = 0;
    for (const count of this.emitted.values()) total += count;
    return total;
  }

  created(turn: ProviderTurn, servers: ClaudeMcpServers): void {
    this.log.info('claude.job_created', {
      ...this.ids(),
      model: turn.model,
      managed: turn.managed_project !== undefined,
      resumed: turn.session_id !== null,
      externalServers: Object.keys(servers).length,
      tools: turn.tools.length,
    });
  }

  modelUnavailable(wanted: string, available: readonly { readonly value: string }[]): void {
    this.log.warn('claude.model_unavailable', {
      ...this.ids(),
      model: wanted,
      available: available.map((entry) => entry.value),
    });
  }

  modelChosen(model: string, resolved: string | undefined, effort: string | undefined): void {
    this.log.debug('claude.model_chosen', () => ({
      ...this.ids(),
      model,
      resolvedModel: resolved,
      effort,
    }));
  }

  turnStarted(startedAt: number, commandsRevision: string, models: number): void {
    this.log.info('claude.turn_started', {
      ...this.ids(),
      models,
      setupMs: Math.round(performance.now() - startedAt),
      commands: commandsRevision,
    });
  }

  turnContinued(model: string): void {
    this.log.info('claude.turn_continued', { ...this.ids(), model, priorEvents: this.total() });
    this.emitted.clear();
  }

  commandSent(name: string, argumentsLength: number): void {
    this.log.info('claude.command_sent', { ...this.ids(), name, argumentsLength });
  }

  steered(parts: number): void {
    this.log.info('claude.steered', { ...this.ids(), parts, emitted: this.total() });
  }

  steerDelivered(parts: number, followUp: boolean): void {
    this.log.info('claude.steer_delivered', { ...this.ids(), parts, followUp });
  }

  contextUnreadable(cause: unknown): void {
    this.log.warn('claude.context_unreadable', { ...this.ids(), error: messageOf(cause) });
  }

  interrupting(): void {
    this.log.info('claude.interrupting', { ...this.ids(), emitted: this.total() });
  }

  stopped(interrupted: boolean, running: boolean): void {
    this.log.info('claude.job_stopped', {
      ...this.ids(),
      interrupted,
      running,
      events: this.counts(),
      lifetimeMs: Math.round(performance.now() - this.createdAt),
    });
  }

  failed(cause: unknown, interrupted: boolean, running: boolean): void {
    this.log.error('claude.job_failed', cause, {
      ...this.ids(),
      running,
      interrupted,
      events: this.counts(),
    });
  }

  emit(kind: string, seq: number): void {
    this.emitted.set(kind, (this.emitted.get(kind) ?? 0) + 1);
    if (kind !== 'text' && kind !== 'runtime') {
      this.log.debug('claude.event_emitted', () => ({ ...this.ids(), kind, seq }));
    }
  }

  turnFinished(subtype: string, interrupted: boolean): void {
    this.log.info('claude.turn_finished', {
      ...this.ids(),
      subtype,
      interrupted,
      events: this.counts(),
      lifetimeMs: Math.round(performance.now() - this.createdAt),
    });
  }

  streamEndedEarly(): void {
    this.log.warn('claude.stream_ended_early', { ...this.ids(), events: this.counts() });
  }

  sessionMismatch(reported: string): void {
    this.log.warn('claude.session_mismatch', { ...this.ids(), reportedSessionId: reported });
  }

  sessionRebound(reported: string): void {
    this.log.debug('claude.session_rebound', () => ({
      ...this.ids(),
      reportedSessionId: reported,
    }));
  }

  mcpRefreshed(servers: number, native: boolean): void {
    this.log.debug('claude.mcp_refreshed', () => ({ ...this.ids(), servers, native }));
  }

  toolDenied(tool: string, server: string | undefined): void {
    this.log.warn('claude.tool_denied', { ...this.ids(), tool, mcpServer: server });
  }
}
