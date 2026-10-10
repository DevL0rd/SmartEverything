import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AiChatRow, AssistantSettings } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import { desktopInstalled } from '../claude-sessions';
import { desktopGuide } from '../manager-guide';
import { SessionRouter } from '../session-router';
import { EngineUnavailableError, type Engine, type EngineStatus } from './engine';

export interface ClaudeChatHooks {
  readonly dataDirectory: string;
  readonly settings: () => AssistantSettings;
  readonly pickedUp: (eventId: string) => void;
  readonly step: (eventId: string, step: string) => void;
  readonly replied: (eventId: string) => void;
  readonly settled: (eventId: string) => void;
  readonly changed: () => void;
  readonly log: Logger;
}

const NEEDS_DESKTOP =
  'Claude Code chats need Claude Desktop on the computer that runs SmartEverything.';
const NO_INTERRUPT = 'Stop it in Claude Desktop; it cannot be interrupted from here.';

export class ClaudeChats {
  private readonly routers = new Map<string, Promise<SessionRouter>>();

  constructor(private readonly hooks: ClaudeChatHooks) {}

  engine(): Engine {
    return {
      kind: 'claude-session',
      status: (chat): EngineStatus => this.status(chat),
      deliver: (event, chat): Promise<void> => this.deliver(event, chat),
      interrupt: (): Promise<void> => Promise.reject(new EngineUnavailableError(NO_INTERRUPT)),
    };
  }

  async open(chat: AiChatRow): Promise<void> {
    await (await this.routerFor(chat)).open();
  }

  async reset(chat: AiChatRow): Promise<void> {
    await (await this.routerFor(chat)).reset();
    this.hooks.changed();
  }

  stop(): void {
    for (const router of this.routers.values()) {
      void router.then((ready) => {
        ready.stop();
      });
    }
    this.routers.clear();
  }

  private status(chat: AiChatRow): EngineStatus {
    return { state: this.busy.has(chat.id) ? 'working' : 'ready', reason: null };
  }

  private readonly busy = new Set<string>();

  private async deliver(event: StoredEvent, chat: AiChatRow): Promise<void> {
    if (this.hooks.settings().background_only || !(await desktopInstalled())) {
      throw new EngineUnavailableError(NEEDS_DESKTOP);
    }
    const router = await this.routerFor(chat);
    await router.route({ eventId: event.id, text: event.text });
  }

  private routerFor(chat: AiChatRow): Promise<SessionRouter> {
    const existing = this.routers.get(chat.id);
    if (existing !== undefined) {
      return existing;
    }
    const router = this.create(chat);
    const started = router.start().then(() => router);
    this.routers.set(chat.id, started);
    started.catch(() => this.routers.delete(chat.id));
    return started;
  }

  private create(chat: AiChatRow): SessionRouter {
    const current = (): AssistantSettings => this.hooks.settings();
    return new SessionRouter({
      statePath: join(this.hooks.dataDirectory, 'assistant', 'claude', `${chat.id}.json`),
      workspace: current().workspace ?? homedir(),
      name: chat.title,
      model: () => chat.engine.model ?? current().conversation_model,
      effort: () => chat.engine.effort ?? current().conversation_effort,
      activity: () => current().activity_steps,
      brief: (sessionId): string =>
        [
          desktopGuide(
            { model: current().new_chat_model, effort: current().new_chat_effort },
            sessionId,
            chat.title,
          ),
          current().instructions,
        ]
          .filter((part) => part !== '')
          .join('\n\n'),
      pickedUp: (eventId): void => {
        this.busy.add(chat.id);
        this.hooks.pickedUp(eventId);
      },
      step: this.hooks.step,
      replied: this.hooks.replied,
      settled: (eventId): void => {
        this.busy.delete(chat.id);
        this.hooks.settled(eventId);
      },
      changed: this.hooks.changed,
    });
  }
}
