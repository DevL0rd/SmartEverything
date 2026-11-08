import type { PluginEvent } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ToolCaller } from '../../../src/ai-tools/hub-tool';
import type { PluginFiles } from '../../../src/plugins/builtin/contract';
import { assemble } from '../../../src/plugins/builtin/discord/assembly';
import { Controls } from '../../../src/plugins/builtin/discord/controls';
import { CONTROL_PREFIX } from '../../../src/plugins/builtin/discord/prompts';
import { DISCORD_SETTINGS } from '../../../src/plugins/builtin/discord/settings';
import { sendTool } from '../../../src/plugins/builtin/discord/tools/send-tool';
import { promptTool } from '../../../src/plugins/builtin/discord/tools/prompt-tool';
import { Typing } from '../../../src/plugins/builtin/discord/typing';
import {
  CHANNEL,
  GUILD,
  OWNER_CALLER,
  OWNER_ID,
  nothing,
  originOf,
  peopleOf,
  worldOf,
} from './fakes';

const BOT = '600000000000000001';
const PROMPTED = z.looseObject({ id: z.string(), flowId: z.string() });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function rethrow(cause: unknown): never {
  throw cause;
}

function files(): PluginFiles {
  const pictures = new Map([['pic-1', { data: PNG, name: 'snapshot-pic-1.jpg' }]]);
  const uploads = new Map([['up-1', { data: Buffer.from('notes'), name: 'notes.txt' }]]);
  return {
    folder: '',
    outbox: '',
    attachmentsOf: () => [],
    fromUpload: (_caller: ToolCaller, id) => Promise.resolve(uploads.get(id) ?? null),
    fromPicture: (_caller: ToolCaller, id) => Promise.resolve(pictures.get(id) ?? null),
    fromMachine: () => Promise.resolve(null),
  };
}

function assembled(): {
  readonly world: ReturnType<typeof worldOf>;
  readonly built: ReturnType<typeof assemble>;
} {
  const world = worldOf();
  const settings = DISCORD_SETTINGS.parse({});
  const built = assemble(
    {
      settings,
      settingsChanged: () => nothing,
      configure: () => Promise.resolve(),
      records: () => world.records,
      people: peopleOf([OWNER_ID, 'owner']),
      assistant: {
        settings: () => ({
          name: null,
          aliases: [],
          activitySteps: false,
          compactAtPercent: 0,
        }),
        conversation: () => null,
        usage: () => {
          throw new Error('not used');
        },
        compact: () => Promise.resolve(false),
        startOver: () => Promise.resolve(false),
        stop: () => Promise.resolve(false),
        setModel: () => Promise.resolve(null),
      },
      files: files(),
      log: { warn: nothing },
    },
    world.rest,
    () => Promise.reject(new Error('no downloads in this test')),
    nothing,
  );
  built.services.identity.botId = BOT;
  built.services.identity.applicationId = BOT;
  return { world, built };
}

describe('the real Discord services', () => {
  it('send posts a run picture and a chat attachment by id through the hub file readers', async () => {
    const { world, built } = assembled();
    const result = await sendTool(built.services).run(
      { channelId: CHANNEL, picture: 'pic-1', files: [{ attachment: 'up-1' }] },
      OWNER_CALLER,
    );
    expect(JSON.stringify(result.response)).not.toContain('not available');
    const posted = world.rest.calls.filter((call) => call.files !== undefined);
    expect(posted.map((call) => call.files?.map((file) => file.name))).toEqual([
      ['notes.txt', 'snapshot-pic-1.jpg'],
    ]);
  });
});

describe('answering a prompt', () => {
  it('emits prompt_answered with the flow id the prompt tool returned', async () => {
    const { world, built } = assembled();
    const { services } = built;
    const origin = originOf(1);
    services.origins.capture(origin);
    const prompted = await promptTool(services).run(
      {
        eventId: origin.id,
        content: 'Turn off the lights?',
        mode: 'buttons',
        options: [
          { key: 'yes', label: 'Yes' },
          { key: 'no', label: 'No' },
        ],
      },
      OWNER_CALLER,
    );
    const { id: messageId, flowId } = PROMPTED.parse(prompted.response);
    const message = world.rest.calls.find((call) => call.route.endsWith('/messages'));
    const components = JSON.stringify(message?.body);
    const customId = new RegExp(`${CONTROL_PREFIX}[0-9a-f-]+`).exec(components)?.[0];
    world.rest.answer('POST', '/interactions/800000000000000001/token/callback', null);
    world.rest.answer('PATCH', `/channels/${CHANNEL}/messages/${messageId}`, null);
    const events: PluginEvent[] = [];
    const typing = new Typing(Date.now, nothing);
    const controls = new Controls({
      services,
      interactions: built.interactions,
      commands: new Map(),
      calls: {
        contextFor: (): string => '',
      },
      guildNames: new Map(),
      typing,
      post: nothing,
      emit: (event): void => {
        events.push(event);
      },
      report: rethrow,
      refused: rethrow,
    });
    await controls.interaction({
      id: '800000000000000001',
      application_id: BOT,
      token: 'token',
      type: 3,
      guild_id: GUILD,
      channel_id: CHANNEL,
      member: { user: { id: OWNER_ID }, roles: [] },
      message: { id: messageId, author: { id: BOT } },
      data: { custom_id: customId, component_type: 2 },
    });
    typing.close();
    expect(events).toEqual([
      {
        kind: 'prompt_answered',
        subject: null,
        data: { prompt_id: flowId, answer: '{"choice":"yes"}', user: OWNER_ID },
      },
    ]);
  });
});
