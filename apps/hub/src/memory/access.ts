import type {
  AiMemoryAccess,
  AiMemoryRecall,
  AiMemoryToolArguments,
  AiMemoryToolResult,
} from '@smarteverything/domain';
import type { MemoryPrincipal } from './principal';
import type { LatestMessage, MemoryService } from './service';
import { runMemoryTool } from './tool';

export interface MemorySessions {
  readonly principal: (sessionId: string) => MemoryPrincipal;
  readonly latest: (sessionId: string) => LatestMessage | null;
}

export class HubMemoryAccess implements AiMemoryAccess {
  constructor(
    private readonly service: MemoryService,
    private readonly sessions: MemorySessions,
  ) {}

  offered(sessionId: string): boolean {
    return this.service.offered(this.sessions.principal(sessionId));
  }

  prepare(sessionId: string): Promise<void> {
    return this.service.prepare(
      this.sessions.principal(sessionId),
      this.sessions.latest(sessionId),
    );
  }

  recall(sessionId: string): AiMemoryRecall {
    return this.service.recall(this.sessions.principal(sessionId));
  }

  call(sessionId: string, args: AiMemoryToolArguments): Promise<AiMemoryToolResult> {
    return runMemoryTool(this.service, this.sessions.principal(sessionId), args);
  }
}
