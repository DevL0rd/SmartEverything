import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.harness-tools');

function since(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export function contextFetched(
  sessionId: string,
  current: {
    readonly tools: readonly unknown[];
    readonly declared_tool_names: readonly string[];
    readonly system: string;
    readonly turn: string;
    readonly compact_at_percent: number;
  },
  startedAt: number,
): void {
  log.debug('context.fetched', () => ({
    session_id: sessionId,
    tools: current.tools.length,
    declared: current.declared_tool_names.length,
    systemChars: current.system.length,
    turnChars: current.turn.length,
    compactAtPercent: current.compact_at_percent,
    durationMs: since(startedAt),
  }));
}

export function catalogueLoaded(tools: number): void {
  log.info('catalogue.loaded', { tools });
}

export function toolRegistered(tool: string, replaced: boolean): void {
  log.debug('tool.registered', { tool, replaced });
}

export function toolSent(sessionId: string, tool: string, argumentKeys: number): void {
  log.debug('tool.sent', { session_id: sessionId, tool, argumentKeys });
}

export function toolFailed(
  sessionId: string,
  tool: string,
  cause: unknown,
  timing: { readonly aborted: boolean; readonly startedAt: number },
): void {
  log.error('tool.transport_failed', cause, {
    session_id: sessionId,
    tool,
    aborted: timing.aborted,
    durationMs: since(timing.startedAt),
  });
}

export function toolAnswered(
  sessionId: string,
  tool: string,
  result: { readonly response: object; readonly pictures: readonly unknown[] },
  startedAt: number,
): void {
  log.debug('tool.answered', () => ({
    session_id: sessionId,
    tool,
    pictures: result.pictures.length,
    failed: 'error' in result.response,
    responseChars: JSON.stringify(result.response).length,
    durationMs: since(startedAt),
  }));
}
