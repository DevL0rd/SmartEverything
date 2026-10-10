import { randomUUID } from 'node:crypto';
import type { InboundMessage } from '@smarteverything/domain';
import { DiscordPolicyError } from '../errors';
import type { EventOrigin } from '../origins';
import type { Person } from '../person';
import { conversationFor, inboundOf, requestText } from '../request';
import type { DiscordServices } from '../services';
import type { Typing } from '../typing';
import type { CallSession } from './call-session';
import type { CallText } from './context';

const SPOKEN_WINDOW_MS = 60_000;
const SPOKEN_LINES = 200;
const SPOKEN_LIMIT = 3000;
const REQUEST_LIMIT = 4000;
const SPOKEN_NOTE = 'Spoken in the call (speech-to-text, may contain errors):';

export interface TypedDeps {
  readonly services: DiscordServices;
  readonly guildNames: ReadonlyMap<string, string>;
  readonly typing: Typing;
  readonly calls: CallText;
  readonly post: (message: InboundMessage) => void;
  readonly report: (cause: unknown) => void;
}

function spokenBy(session: CallSession, userId: string): string {
  return session.transcript
    .recent(SPOKEN_WINDOW_MS, SPOKEN_LINES)
    .filter((line) => line.speaker_id === userId && !line.bot)
    .map((line) => line.text)
    .join(' ')
    .slice(-SPOKEN_LIMIT);
}

export class TypedRequests {
  constructor(private readonly deps: TypedDeps) {}

  request(session: CallSession, person: Person, text: string): void {
    this.send(session, person, spokenBy(session, person.id) || text).catch(this.deps.report);
  }

  private async send(session: CallSession, person: Person, text: string): Promise<void> {
    const { services, typing, calls } = this.deps;
    const origin: EventOrigin = {
      id: randomUUID(),
      kind: 'voice',
      actorId: person.id,
      channelId: session.channelId,
      guildId: session.guildId,
      text: `${SPOKEN_NOTE} ${text}`.slice(0, REQUEST_LIMIT),
      author: person,
      receivedAt: new Date(services.now()).toISOString(),
    };
    try {
      services.policy.assertOrigin(origin);
    } catch (cause) {
      if (cause instanceof DiscordPolicyError) {
        return;
      }
      throw cause;
    }
    services.origins.capture(origin);
    this.deps.post(
      inboundOf({
        origin,
        conversation: await conversationFor(
          services,
          this.deps.guildNames,
          origin,
          this.deps.report,
        ),
        text: `${calls.textFor(session)}${requestText(origin, '', [])}`,
        attachments: [],
        progress: services.activity.progress(),
      }),
    );
    typing.start(origin.id, () => services.sender.typing(origin.id));
  }
}
