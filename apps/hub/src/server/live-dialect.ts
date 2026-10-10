import type {
  LiveClientMessage,
  LiveMessage,
  LiveStream,
  LiveTable,
} from '@smarteverything/domain';

type Ready = Extract<LiveMessage, { type: 'ready' }>;

type Subscribed = Extract<LiveMessage, { type: 'subscribed' }>;

export type Greeting = Omit<Ready, 'seq'>;

type LegacyGreeting = Greeting | Pick<Subscribed, 'type' | 'tables'>;

export type Outgoing = LiveMessage | LegacyGreeting;

export type LiveNotice = Exclude<LiveMessage, { type: 'change' | 'ready' | 'subscribed' }>;

export interface LiveDialect {
  readonly name: 'current' | 'legacy';
  readonly ready: (greeting: Greeting, seq: number) => Outgoing;
  readonly subscribed: (
    tables: readonly LiveTable[],
    streams: readonly LiveStream[],
    seq: number,
  ) => Outgoing;
  readonly hears: (notice: LiveNotice) => boolean;
}

export interface Subscription {
  readonly dialect: LiveDialect;
  readonly message: LiveClientMessage;
}

export const CURRENT_DIALECT: LiveDialect = {
  name: 'current',
  ready: (greeting, seq) => ({ ...greeting, seq }),
  subscribed: (tables, streams, seq) => ({
    type: 'subscribed',
    tables: [...tables],
    streams: [...streams],
    seq,
  }),
  hears: () => true,
};
