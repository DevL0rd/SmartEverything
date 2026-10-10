import type { LiveSession } from './gemini';

export const TOOL_PROGRESS_AFTER_MS = 4000;
export const TOOL_PROGRESS_EVERY_MS = 8000;

export interface ToolProgressPorts {
  readonly session: () => LiveSession | null;
  readonly closed: () => boolean;
  readonly userSpeaking: () => boolean;
  readonly assistantSpeaking: () => boolean;
  readonly now: () => number;
}

export function progressNote(name: string, seconds: number): string {
  return `[Progress note, not from them: ${name} is still running after ${String(seconds)} seconds. Tell them in one short sentence that you are still on it. Do not call a tool for this note.]`;
}

export function trackToolProgress(name: string, ports: ToolProgressPorts): () => void {
  const startedAt = ports.now();
  let timer: NodeJS.Timeout | null = null;
  const arm = (ms: number): void => {
    timer = setTimeout(() => {
      timer = null;
      if (ports.closed()) {
        return;
      }
      const session = ports.session();
      if (session !== null && !ports.userSpeaking() && !ports.assistantSpeaking()) {
        session.text(progressNote(name, Math.round((ports.now() - startedAt) / 1000)), true);
      }
      arm(TOOL_PROGRESS_EVERY_MS);
    }, ms);
    timer.unref();
  };
  arm(TOOL_PROGRESS_AFTER_MS);
  return (): void => {
    clearTimeout(timer ?? undefined);
    timer = null;
  };
}
