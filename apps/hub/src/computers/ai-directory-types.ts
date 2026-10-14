import type { ComputerAiHost, ComputerAiHostEvent } from './ai-host';
export interface AttachedClaude {
  readonly deviceId: string;
  readonly host: ComputerAiHost;
  readonly local: boolean;
  readonly leave: () => void;
}
export interface ClaudeJob {
  readonly deviceId: string;
  readonly chatId: string;
  seq: number;
  sessionId: string | null;
}
export interface ComputerAiDirectoryEvent {
  readonly deviceId: string;
  readonly profileId?: string;
  readonly event: ComputerAiHostEvent;
}
