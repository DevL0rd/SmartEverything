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
  readonly principal: (sessionId: string) => Promise<MemoryPrincipal>;
  readonly latest: (sessionId: string) => Promise<LatestMessage | null>;
}

export class HubMemoryAccess implements AiMemoryAccess {
  constructor(
    private readonly service: MemoryService,
    private readonly sessions: MemorySessions,
  ) {}

  async offered(sessionId: string): Promise<boolean> {
    return this.service.offered(await this.sessions.principal(sessionId));
  }

  async prepare(sessionId: string): Promise<void> {
    await this.service.prepare(
      await this.sessions.principal(sessionId),
      await this.sessions.latest(sessionId),
    );
  }

  async recall(sessionId: string): Promise<AiMemoryRecall> {
    return this.service.recall(await this.sessions.principal(sessionId));
  }

  async call(sessionId: string, args: AiMemoryToolArguments): Promise<AiMemoryToolResult> {
    return runMemoryTool(this.service, await this.sessions.principal(sessionId), args);
  }
}
