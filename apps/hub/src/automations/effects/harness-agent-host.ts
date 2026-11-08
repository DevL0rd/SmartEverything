import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import mime from 'mime-types';
import { usdOfMicros } from '@smarteverything/domain';
import type { AiChatRow, AiUsageRow, AssistantOutFile } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import type { ChatOwner } from '../../assistant/chat-directory';
import type { InboundTurn } from '../../assistant/requests';
import type { TurnEnded } from '../../assistant/service-contract';
import { meteredCatalogue, meteredEngine } from '../../openrouter/metered-engine';
import type { Store } from '../../store/store';
import type { AgentHost, AgentLaunch, AgentMessage, AgentSession, AgentSpend } from './dsh-agent';
import { IntegrationError } from './integration-error';
import type { OneShotPicture } from './one-shot-model';

const log = new Logger('hub.automations');

const AUTHOR = 'Automation';
const CHAT_TITLE = 'Automation AI step';

export interface AgentAssistant {
  readonly inbound: (turn: InboundTurn) => Promise<{ eventId: string; messageId: string }>;
  readonly onFinished: (listener: TurnEnded) => () => void;
  readonly interrupt: (owner: ChatOwner, chatId: string) => Promise<void>;
  readonly removeChat: (owner: ChatOwner, chatId: string) => Promise<void>;
}

export interface AgentHostPorts {
  readonly assistant: AgentAssistant;
  readonly store: {
    readonly aiChats: Pick<Store['aiChats'], 'create'>;
    readonly aiModels: Pick<Store['aiModels'], 'row'>;
    readonly ledger: Pick<Store['ledger'], 'on'>;
  };
  readonly interactions: (listener: (chatId: string) => void) => () => void;
  readonly tmp: string;
}

interface Finish {
  readonly text: string;
  readonly ok: boolean;
}

interface Waiting {
  readonly promise: Promise<Finish>;
  readonly settle: (finish: Finish) => void;
  readonly fail: (cause: Error) => void;
}

function waiting(): Waiting {
  let settle: Waiting['settle'] = () => undefined;
  let fail: Waiting['fail'] = () => undefined;
  const promise = new Promise<Finish>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

interface Staged {
  readonly files: readonly AssistantOutFile[];
  readonly dispose: () => Promise<void>;
}

async function stage(tmp: string, pictures: readonly OneShotPicture[]): Promise<Staged> {
  if (pictures.length === 0) return { files: [], dispose: () => Promise.resolve() };
  await mkdir(tmp, { recursive: true, mode: 0o700 });
  const folder = await mkdtemp(join(tmp, 'se-automation-'));
  const files = await Promise.all(
    pictures.map(async (picture, index) => {
      const extension = mime.extension(picture.mimeType);
      const path = join(
        folder,
        `picture-${String(index + 1)}${extension === false ? '' : `.${extension}`}`,
      );
      await writeFile(path, Buffer.from(picture.base64, 'base64'), { mode: 0o600 });
      return { path };
    }),
  );
  return { files, dispose: () => rm(folder, { recursive: true, force: true }) };
}

class HarnessAgentSession implements AgentSession {
  private pending: Waiting | undefined;
  private readonly rows = new Map<string, AiUsageRow>();
  private readonly watchers = new Set<(spend: AgentSpend) => void>();
  private readonly subscriptions: readonly (() => void)[];

  constructor(
    private readonly ports: AgentHostPorts,
    private readonly chat: AiChatRow,
    private readonly owner: ChatOwner,
  ) {
    this.subscriptions = [
      ports.assistant.onFinished((event, text, ok) => {
        if (event.chat_id === chat.id) this.pending?.settle({ text, ok });
      }),
      ports.store.ledger.on((row) => {
        this.charged(row);
      }),
      ports.interactions((chatId) => {
        if (chatId === chat.id) this.asked();
      }),
    ];
  }

  async say(message: AgentMessage): Promise<string> {
    const turn = waiting();
    this.pending = turn;
    try {
      const [, finish] = await Promise.all([this.send(message), turn.promise]);
      if (!finish.ok)
        throw new IntegrationError('Unreachable', `The AI did not answer: ${finish.text}`);
      return finish.text;
    } finally {
      this.pending = undefined;
    }
  }

  spent(): AgentSpend {
    let tokens = 0;
    let micros = 0;
    for (const row of this.rows.values()) {
      tokens += row.tokens_in + row.tokens_out;
      micros += row.cost_micros;
    }
    return { tokens, costUsd: usdOfMicros(micros) };
  }

  onSpend(listener: (spend: AgentSpend) => void): () => void {
    this.watchers.add(listener);
    return (): void => {
      this.watchers.delete(listener);
    };
  }

  interrupt(): Promise<void> {
    return this.ports.assistant.interrupt(this.owner, this.chat.id);
  }

  async end(): Promise<void> {
    for (const unsubscribe of this.subscriptions) unsubscribe();
    await this.ports.assistant.removeChat(this.owner, this.chat.id).catch((cause: unknown) => {
      log.error('automation.agent_chat_left', cause, { chatId: this.chat.id });
    });
  }

  private async send(message: AgentMessage): Promise<void> {
    const staged = await stage(this.ports.tmp, message.pictures);
    try {
      await this.ports.assistant.inbound({
        chat: this.chat,
        author: AUTHOR,
        text: message.text,
        files: staged.files,
        engineText: message.text,
        origin: { source: 'wake', plugin_id: null, device_id: null, name: AUTHOR },
      });
    } finally {
      await staged.dispose();
    }
  }

  private charged(row: AiUsageRow): void {
    if (row.chat_id !== this.chat.id) return;
    this.rows.set(row.id, row);
    const spend = this.spent();
    for (const watcher of this.watchers) watcher(spend);
  }

  private asked(): void {
    if (this.pending === undefined) return;
    this.pending.fail(
      new IntegrationError(
        'Refused',
        'The AI asked for an answer or an approval, which an automation cannot give.',
      ),
    );
    background(this.interrupt(), 'automation.agent_interrupt_failed');
  }
}

export class HarnessAgentHost implements AgentHost {
  constructor(private readonly ports: AgentHostPorts) {}

  open(launch: AgentLaunch): AgentSession {
    const { store } = this.ports;
    const owner: ChatOwner = { profileId: launch.profileId, role: launch.role };
    const chat = store.aiChats.create({
      profileId: launch.profileId,
      kind: 'chat',
      title: CHAT_TITLE,
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: meteredEngine(
        launch.profileId,
        { model: launch.model, effort: null },
        meteredCatalogue(store),
      ),
      tools: launch.tools,
      titleAuto: false,
    });
    return new HarnessAgentSession(this.ports, chat, owner);
  }
}
