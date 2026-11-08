import type { PluginEvent } from '@smarteverything/domain';
import { PLUGIN_EVENT, PLUGIN_MANIFEST } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  DISCORD_EVENT_KINDS,
  DiscordAutomationEvents,
  GUILD_MESSAGE_REACTIONS_INTENT,
  promptAnsweredEvent,
  withAutomationEvents,
} from '../../../src/plugins/builtin/discord/automation-events';
import type {
  DiscordLink,
  GatewayPacket,
  LinkHandlers,
} from '../../../src/plugins/builtin/discord/link';
import { createDiscordPlugin } from '../../../src/plugins/builtin/discord/plugin';
import type { DiscordEnvironment } from '../../../src/plugins/builtin/discord/runtime';
import { CHANNEL, GUEST_ID, GUILD, MESSAGE, OTHER_CHANNEL, OWNER_ID } from './fakes';

const BOT_ID = '100000000000000099';

function tapped(): {
  readonly events: PluginEvent[];
  readonly failures: unknown[];
  readonly tap: DiscordAutomationEvents;
  readonly send: (type: string, data: unknown) => void;
} {
  const events: PluginEvent[] = [];
  const failures: unknown[] = [];
  const tap = new DiscordAutomationEvents(
    (event) => events.push(event),
    (cause) => failures.push(cause),
  );
  const send = (type: string, data: unknown): void => {
    tap.packet({ t: type, d: data });
  };
  send('READY', { user: { id: BOT_ID } });
  return { events, failures, tap, send };
}

function pollMessage(finalized: boolean): unknown {
  return {
    id: MESSAGE,
    channel_id: CHANNEL,
    poll: {
      question: { text: 'Pizza or pasta?' },
      answers: [
        { answer_id: 1, poll_media: { text: 'Pizza' } },
        { answer_id: 2, poll_media: { text: 'Pasta' } },
      ],
      results: { is_finalized: finalized, answer_counts: [{ id: 1, count: 3, me_voted: false }] },
    },
  };
}

function voiceState(user: string, channel: string | null, bot?: boolean): unknown {
  return {
    guild_id: GUILD,
    channel_id: channel,
    user_id: user,
    member: { user: { id: user, ...(bot === undefined ? {} : { bot }) } },
  };
}

describe('Discord events for automations', () => {
  it('declares every event kind in the manifest', () => {
    const manifest = PLUGIN_MANIFEST.parse(
      createDiscordPlugin({
        connect: () => {
          throw new Error('not connected in this test');
        },
        download: () => Promise.reject(new Error('none')),
        voice: () => {
          throw new Error('none');
        },
      }).manifest,
    );
    expect(manifest.contributes.events.map((event) => event.kind)).toEqual(
      DISCORD_EVENT_KINDS.map((event) => event.kind),
    );
    expect(DISCORD_EVENT_KINDS.map((event) => event.kind)).toEqual([
      'message_received',
      'reaction_added',
      'member_joined_server',
      'voice_joined',
      'voice_left',
      'bot_voice_changed',
      'prompt_answered',
      'poll_ended',
    ]);
  });

  it('emits data with exactly the fields and types each event kind declares', () => {
    const { events, send } = tapped();
    send('MESSAGE_CREATE', {
      id: MESSAGE,
      channel_id: CHANNEL,
      content: 'a',
      author: { id: OWNER_ID },
    });
    send('MESSAGE_REACTION_ADD', {
      user_id: GUEST_ID,
      channel_id: CHANNEL,
      message_id: MESSAGE,
      guild_id: GUILD,
      emoji: { id: null, name: '👍' },
    });
    send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: GUEST_ID } });
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, CHANNEL));
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, null));
    send('VOICE_STATE_UPDATE', voiceState(BOT_ID, CHANNEL));
    events.push(promptAnsweredEvent({ promptId: 'p', answer: 'a', user: GUEST_ID }));
    send('MESSAGE_UPDATE', pollMessage(true));
    expect(new Set(events.map((event) => event.kind))).toEqual(
      new Set(DISCORD_EVENT_KINDS.map((event) => event.kind)),
    );
    for (const event of events) {
      const declared = DISCORD_EVENT_KINDS.find((kind) => kind.kind === event.kind);
      expect(Object.keys(event.data)).toEqual(
        expect.arrayContaining(Object.keys(declared?.fields ?? {})),
      );
      for (const [field, type] of Object.entries(declared?.fields ?? {})) {
        expect(typeof event.data[field]).toBe(type);
      }
    }
  });

  it('emits poll_ended with the votes of each answer once Discord finalizes a poll, and not before', () => {
    const { events, failures, send } = tapped();
    send('MESSAGE_UPDATE', pollMessage(false));
    send('MESSAGE_UPDATE', { id: MESSAGE, channel_id: CHANNEL, content: 'edited' });
    expect(events).toEqual([]);
    send('MESSAGE_UPDATE', pollMessage(true));
    expect(events).toEqual([
      {
        kind: 'poll_ended',
        subject: null,
        data: {
          channel: CHANNEL,
          message: MESSAGE,
          results: [
            { answer: 'Pizza', votes: 3 },
            { answer: 'Pasta', votes: 0 },
          ],
        },
      },
    ]);
    expect(failures).toEqual([]);
    events.forEach((event) => PLUGIN_EVENT.parse(event));
  });

  it('emits message_received with the channel, message id, author, text and attachment flag', () => {
    const { events, send } = tapped();
    send('MESSAGE_CREATE', {
      id: MESSAGE,
      channel_id: CHANNEL,
      content: 'dinner is ready',
      author: { id: OWNER_ID },
      attachments: [{ id: '1' }],
    });
    send('MESSAGE_CREATE', {
      id: MESSAGE,
      channel_id: OTHER_CHANNEL,
      content: '',
      author: { id: GUEST_ID },
    });
    expect(events).toEqual([
      {
        kind: 'message_received',
        subject: null,
        data: {
          channel: CHANNEL,
          message: MESSAGE,
          author: OWNER_ID,
          text: 'dinner is ready',
          has_attachment: true,
        },
      },
      {
        kind: 'message_received',
        subject: null,
        data: {
          channel: OTHER_CHANNEL,
          message: MESSAGE,
          author: GUEST_ID,
          text: '',
          has_attachment: false,
        },
      },
    ]);
    events.forEach((event) => PLUGIN_EVENT.parse(event));
  });

  it('never reports the assistant its own messages or reactions, so an automation cannot loop', () => {
    const { events, send } = tapped();
    send('MESSAGE_CREATE', {
      id: MESSAGE,
      channel_id: CHANNEL,
      content: 'hi',
      author: { id: BOT_ID, bot: true },
    });
    send('MESSAGE_REACTION_ADD', {
      user_id: BOT_ID,
      channel_id: CHANNEL,
      message_id: MESSAGE,
      guild_id: GUILD,
      emoji: { id: null, name: '👍' },
    });
    expect(events).toEqual([]);
  });

  it('emits reaction_added with unicode emoji as the character and custom emoji as name:id', () => {
    const { events, send } = tapped();
    const reaction = (emoji: unknown): void => {
      send('MESSAGE_REACTION_ADD', {
        user_id: GUEST_ID,
        channel_id: CHANNEL,
        message_id: MESSAGE,
        guild_id: GUILD,
        emoji,
      });
    };
    reaction({ id: null, name: '👍' });
    reaction({ id: '600000000000000001', name: 'party' });
    expect(events.map((event) => event.data['emoji'])).toEqual(['👍', 'party:600000000000000001']);
    expect(events[0]).toMatchObject({
      kind: 'reaction_added',
      data: { channel: CHANNEL, message: MESSAGE, person: GUEST_ID },
    });
  });

  it('emits member_joined_server for people but not for bots', () => {
    const { events, send } = tapped();
    send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: GUEST_ID } });
    send('GUILD_MEMBER_ADD', { guild_id: GUILD, user: { id: '100000000000000050', bot: true } });
    expect(events).toEqual([
      { kind: 'member_joined_server', subject: null, data: { server: GUILD, person: GUEST_ID } },
    ]);
  });

  it('turns voice state changes into joined, left and moved, ignoring mute and deafen updates', () => {
    const { events, send } = tapped();
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, CHANNEL));
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, CHANNEL));
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, OTHER_CHANNEL));
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, null));
    expect(events.map((event) => [event.kind, event.data['channel']])).toEqual([
      ['voice_joined', CHANNEL],
      ['voice_left', CHANNEL],
      ['voice_joined', OTHER_CHANNEL],
      ['voice_left', OTHER_CHANNEL],
    ]);
    expect(events.every((event) => event.data['person'] === GUEST_ID)).toBe(true);
  });

  it('knows who was already in a voice channel when the server loaded, so their leave is a leave', () => {
    const { events, send } = tapped();
    send('GUILD_CREATE', {
      id: GUILD,
      voice_states: [{ user_id: GUEST_ID, channel_id: CHANNEL }],
    });
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, CHANNEL));
    expect(events).toEqual([]);
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, null));
    expect(events).toEqual([
      { kind: 'voice_left', subject: null, data: { channel: CHANNEL, person: GUEST_ID } },
    ]);
  });

  it('reports the assistant itself as bot_voice_changed and other bots not at all', () => {
    const { events, send } = tapped();
    send('VOICE_STATE_UPDATE', voiceState(BOT_ID, CHANNEL, true));
    send('VOICE_STATE_UPDATE', voiceState('100000000000000050', CHANNEL, true));
    send('VOICE_STATE_UPDATE', voiceState(BOT_ID, null, true));
    expect(events).toEqual([
      { kind: 'bot_voice_changed', subject: null, data: { channel: CHANNEL, connected: true } },
      { kind: 'bot_voice_changed', subject: null, data: { channel: '', connected: false } },
    ]);
  });

  it('forgets a server that is removed, and keeps it when it is only unavailable', () => {
    const { events, send } = tapped();
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, CHANNEL));
    send('GUILD_DELETE', { id: GUILD, unavailable: true });
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, null));
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, CHANNEL));
    send('GUILD_DELETE', { id: GUILD });
    send('VOICE_STATE_UPDATE', voiceState(GUEST_ID, null));
    expect(events.map((event) => event.kind)).toEqual([
      'voice_joined',
      'voice_left',
      'voice_joined',
    ]);
  });

  it('reports a payload it cannot read to the plugin log and keeps running', () => {
    const { events, failures, send } = tapped();
    send('MESSAGE_CREATE', {
      id: MESSAGE,
      channel_id: 'not-a-snowflake',
      author: { id: OWNER_ID },
    });
    send('MESSAGE_CREATE', {
      id: MESSAGE,
      channel_id: CHANNEL,
      content: 'ok',
      author: { id: OWNER_ID },
    });
    expect(failures).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it('builds prompt_answered from the prompt id, the answer and the person', () => {
    expect(promptAnsweredEvent({ promptId: 'flow-1', answer: 'yes', user: OWNER_ID })).toEqual({
      kind: 'prompt_answered',
      subject: null,
      data: { prompt_id: 'flow-1', answer: 'yes', user: OWNER_ID },
    });
  });
});

describe('the Discord link wrapper', () => {
  function connected(): {
    readonly intents: number[];
    readonly events: PluginEvent[];
    readonly link: DiscordLink;
    readonly gateway: (packet: GatewayPacket) => void;
  } {
    const intents: number[] = [];
    const events: PluginEvent[] = [];
    let pushed: LinkHandlers | null = null;
    const base: DiscordLink = {
      rest: {
        get: () => Promise.resolve(null),
        post: () => Promise.resolve(null),
        postFiles: () => Promise.resolve(null),
        patch: () => Promise.resolve(null),
        put: () => Promise.resolve(null),
        delete: () => Promise.resolve(null),
        anonymous: {
          get: () => Promise.resolve(null),
          post: () => Promise.resolve(null),
          postFiles: () => Promise.resolve(null),
          patch: () => Promise.resolve(null),
          put: () => Promise.resolve(null),
          delete: () => Promise.resolve(null),
        },
      },
      send: () => Promise.resolve(),
      connect: (handlers) => {
        pushed = handlers;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    };
    const environment: DiscordEnvironment = {
      connect: (options) => {
        intents.push(options.intents);
        return base;
      },
      download: () => Promise.reject(new Error('none')),
      voice: () => {
        throw new Error('none');
      },
    };
    const link = withAutomationEvents(
      environment,
      (event) => events.push(event),
      () => undefined,
    ).connect({ token: 'fake', intents: 1 });
    return {
      intents,
      events,
      link,
      gateway: (packet): void => {
        pushed?.packet(packet);
      },
    };
  }

  it('asks Discord for reaction events on top of the intents the plugin already uses', () => {
    const { intents } = connected();
    expect(intents).toEqual([1 | GUILD_MESSAGE_REACTIONS_INTENT]);
  });

  it('hands every gateway packet to the plugin first and to the automation events after', async () => {
    const world = connected();
    const seen: GatewayPacket[] = [];
    await world.link.connect({
      packet: (packet) => seen.push(packet),
      state: () => undefined,
    });
    world.gateway({ t: 'READY', d: { user: { id: BOT_ID } } });
    world.gateway({
      t: 'MESSAGE_CREATE',
      d: { id: MESSAGE, channel_id: CHANNEL, content: 'hello', author: { id: OWNER_ID } },
    });
    expect(seen.map((packet) => packet.t)).toEqual(['READY', 'MESSAGE_CREATE']);
    expect(world.events.map((event) => event.kind)).toEqual(['message_received']);
  });
});
