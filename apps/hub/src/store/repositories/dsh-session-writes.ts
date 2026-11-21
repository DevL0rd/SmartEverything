import {
  DSH_SESSION_ACQUIRE,
  DSH_SESSION_APPEND,
  DSH_SESSION_CREATE,
  type AiModelRouteSelection,
  type DshSessionAppend,
  type DshSessionEvent,
  type DshSessionMetadata,
} from '@smarteverything/domain';
import type { StoreHost } from '../host/host';
import { assertHeldWork, type ChatWorkHolds, type HeldChats } from './ai-chat-removal-hold';
import type { DshSessionPrincipal } from './dsh-session-claims';
import type {
  DshSessionListener,
  DshSessionOpened,
  DshSessionsRepository,
  DshSessionWrite,
} from './dsh-sessions';

export interface DshRouteBinding {
  readonly choice: {
    readonly agentProvider: string;
    readonly agentModel: string;
    readonly agentReasoningEffort?: string | undefined;
  };
  readonly route: AiModelRouteSelection;
}

export type DshAppendPlanner = (
  sessionId: string,
  events: DshSessionAppend['events'],
) => Promise<readonly DshRouteBinding[]>;

export interface HeldSessionOpen {
  readonly input: unknown;
  readonly authority: DshSessionPrincipal;
  readonly held: HeldChats;
}

export interface HeldSessionRewrite {
  readonly sessionId: string;
  readonly profileId: string;
  readonly events: readonly DshSessionEvent[];
  readonly held: HeldChats;
}

export interface SessionAppend {
  readonly input: DshSessionAppend;
  readonly authority: DshSessionPrincipal;
  readonly routes: readonly DshRouteBinding[];
}

export function createHeld(
  sessions: DshSessionsRepository,
  open: HeldSessionOpen,
): DshSessionOpened {
  assertHeldWork(open.held, DSH_SESSION_CREATE.parse(open.input).chat_id);
  return sessions.create(open.input, open.authority);
}

export function acquireHeld(
  sessions: DshSessionsRepository,
  open: HeldSessionOpen,
): DshSessionOpened {
  const owner = sessions.ownerOf(DSH_SESSION_ACQUIRE.parse(open.input).session_id);
  if (owner !== undefined) assertHeldWork(open.held, owner.chat_id);
  return sessions.acquire(open.input, open.authority);
}

export function rewriteHeld(
  sessions: DshSessionsRepository,
  rewrite: HeldSessionRewrite,
): ReturnType<DshSessionsRepository['rewrite']> {
  const owner = sessions.ownerOf(rewrite.sessionId);
  if (owner !== undefined) assertHeldWork(rewrite.held, owner.chat_id);
  return sessions.rewrite(rewrite.sessionId, rewrite.profileId, rewrite.events);
}

export class DshSessionWrites {
  private readonly appended = new Set<DshSessionListener>();
  private readonly planners = new Set<DshAppendPlanner>();

  constructor(
    private readonly host: StoreHost,
    private readonly holds: ChatWorkHolds,
  ) {}

  onAppend(listener: DshSessionListener): void {
    this.appended.add(listener);
  }

  planAppend(planner: DshAppendPlanner): void {
    this.planners.add(planner);
  }

  held(): HeldChats {
    return this.holds.held();
  }

  create(input: unknown, authority: DshSessionPrincipal): Promise<DshSessionOpened> {
    return this.host.write('dshSessionCreate', { input, authority, held: this.held() });
  }

  acquire(input: unknown, authority: DshSessionPrincipal): Promise<DshSessionOpened> {
    return this.host.write('dshSessionAcquire', { input, authority, held: this.held() });
  }

  async append(input: unknown, authority: DshSessionPrincipal): Promise<DshSessionMetadata> {
    const request = DSH_SESSION_APPEND.parse(input);
    const sessionId = request.claim.session_id;
    const plans = await Promise.all(
      [...this.planners].map((planner) => planner(sessionId, request.events)),
    );
    const metadata = await this.host.write('dshSessionAppend', {
      input: request,
      authority,
      routes: plans.flat(),
    });
    this.announce(sessionId, request.events, 'append');
    return metadata;
  }

  async rewrite(
    sessionId: string,
    profileId: string,
    events: readonly DshSessionEvent[],
  ): Promise<DshSessionMetadata> {
    const written = await this.host.write('dshSessionRewrite', {
      sessionId,
      profileId,
      events,
      held: this.held(),
    });
    this.announce(sessionId, written.events, 'rewrite');
    return written.metadata;
  }

  private announce(
    sessionId: string,
    events: DshSessionAppend['events'],
    write: DshSessionWrite,
  ): void {
    for (const listener of this.appended) listener(sessionId, events, write);
  }
}
