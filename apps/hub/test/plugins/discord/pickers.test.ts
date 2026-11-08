import { describe, expect, it } from 'vitest';
import { PLUGIN_OPTION_PAGE, type PluginOptionPage } from '@smarteverything/domain';
import { discordPicker, type PickerWorld } from '../../../src/plugins/builtin/discord/pickers';
import { GUILD, GUEST_ID, OWNER_CALLER, OWNER_ID, worldOf } from './fakes';

const OTHER_GUILD = '200000000000000002';

function picking(online = true): { world: PickerWorld; rest: ReturnType<typeof worldOf>['rest'] } {
  const { rest } = worldOf();
  const world: PickerWorld = {
    rest,
    guilds: () =>
      new Map([
        [OTHER_GUILD, 'Workshop'],
        [GUILD, 'Home'],
      ]),
    ready: () => online,
  };
  return { world, rest };
}

function ready(page: PluginOptionPage): Extract<PluginOptionPage, { state: 'ready' }> {
  const parsed = PLUGIN_OPTION_PAGE.parse(page);
  if (parsed.state !== 'ready') {
    throw new Error(`expected a ready page, got ${parsed.message}`);
  }
  return parsed;
}

describe('the Discord role picker', () => {
  it('lists the real roles of every server, highest first, without the everyone role', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${GUILD}/roles`, [
      { id: GUILD, name: '@everyone', position: 0, color: 0 },
      { id: '500000000000000001', name: 'Family', position: 2, color: 0xff0000 },
      { id: '500000000000000002', name: 'Guests', position: 1, color: 0 },
    ]);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/roles`, [
      { id: '500000000000000003', name: 'Crew', position: 5, color: 0 },
    ]);
    const page = ready(await discordPicker('roles', () => world)({}, OWNER_CALLER));
    expect(page.options.map((option) => [option.label, option.detail, option.color])).toEqual([
      ['@Crew', 'Workshop', null],
      ['@Family', 'Home', '#ff0000'],
      ['@Guests', 'Home', null],
    ]);
  });

  it('names chosen roles by id and drops ids that are not Discord ids', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${GUILD}/roles`, [
      { id: '500000000000000001', name: 'Family', position: 2 },
    ]);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/roles`, []);
    const page = ready(
      await discordPicker('roles', () => world)(
        { ids: '500000000000000001,not-an-id' },
        OWNER_CALLER,
      ),
    );
    expect(page.options.map((option) => option.id)).toEqual(['500000000000000001']);
  });

  it('filters by the typed text', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${GUILD}/roles`, [
      { id: '500000000000000001', name: 'Family', position: 2 },
      { id: '500000000000000002', name: 'Guests', position: 1 },
    ]);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/roles`, []);
    const page = ready(await discordPicker('roles', () => world)({ q: 'gue' }, OWNER_CALLER));
    expect(page.options.map((option) => option.label)).toEqual(['@Guests']);
  });
});

describe('the Discord people picker', () => {
  it('lists real members with their nickname, skipping bots', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${OTHER_GUILD}/members`, []);
    rest.answer('GET', `/guilds/${GUILD}/members`, [
      { nick: 'Boss', user: { id: OWNER_ID, username: 'owner', global_name: 'Owner' } },
      { nick: null, user: { id: GUEST_ID, username: 'guest', global_name: null, avatar: 'ab' } },
      { nick: null, user: { id: '100000000000000009', username: 'robot', bot: true } },
    ]);
    const picker = discordPicker('people', () => world);
    const first = ready(await picker({}, OWNER_CALLER));
    const second = ready(await picker({ after: first.next ?? '' }, OWNER_CALLER));
    const options = [...first.options, ...second.options];
    expect(options.map((option) => option.label)).toEqual(['Boss', 'guest']);
    expect(options[1]?.image).toBe(`https://cdn.discordapp.com/avatars/${GUEST_ID}/ab.png?size=64`);
  });

  it('names a chosen person from their Discord id', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/users/${OWNER_ID}`, {
      id: OWNER_ID,
      username: 'owner',
      global_name: 'Owner',
    });
    const page = ready(await discordPicker('people', () => world)({ ids: OWNER_ID }, OWNER_CALLER));
    expect(page.options.map((option) => [option.id, option.label, option.detail])).toEqual([
      [OWNER_ID, 'Owner', '@owner'],
    ]);
  });

  it('names more chosen people than a browsing page holds', async () => {
    const { world, rest } = picking();
    const ids = Array.from({ length: 60 }, (_, index) => String(100000000000000100 + index));
    ids.forEach((id) => {
      rest.answer('GET', `/users/${id}`, { id, username: `user${id}` });
    });
    const page = ready(
      await discordPicker('people', () => world)({ ids: ids.join(',') }, OWNER_CALLER),
    );
    expect(page.options).toHaveLength(60);
  });
});

describe('the Discord channel picker', () => {
  it('lists text channels and active threads but not categories', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${OTHER_GUILD}/channels`, []);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/threads/active`, { threads: [] });
    rest.answer('GET', `/guilds/${GUILD}/channels`, [
      { id: '300000000000000001', type: 0, name: 'general' },
      { id: '300000000000000002', type: 4, name: 'Category' },
    ]);
    rest.answer('GET', `/guilds/${GUILD}/threads/active`, {
      threads: [{ id: '300000000000000003', type: 11, name: 'plans' }],
    });
    const page = ready(await discordPicker('channels', () => world)({}, OWNER_CALLER));
    expect(page.options.map((option) => [option.label, option.detail])).toEqual([
      ['#general', 'Home'],
      ['#plans', 'Thread · Home'],
    ]);
  });
});

describe('the Discord servers picker', () => {
  it('lists the servers the bot is in, sorted by name', async () => {
    const { world } = picking();
    const page = ready(await discordPicker('servers', () => world)({}, OWNER_CALLER));
    expect(page.options.map((option) => option.label)).toEqual(['Home', 'Workshop']);
  });
});

describe('a Discord picker with no live connection', () => {
  it('says Discord is not connected instead of listing nothing', async () => {
    const { world } = picking(false);
    const page = PLUGIN_OPTION_PAGE.parse(
      await discordPicker('roles', () => world)({}, OWNER_CALLER),
    );
    expect(page).toMatchObject({ state: 'unavailable' });
    const none = PLUGIN_OPTION_PAGE.parse(
      await discordPicker('roles', () => null)({}, OWNER_CALLER),
    );
    expect(none.state).toBe('unavailable');
  });

  it('reports why Discord would not list instead of throwing', async () => {
    const { world } = picking();
    const page = PLUGIN_OPTION_PAGE.parse(
      await discordPicker('roles', () => world)({}, OWNER_CALLER),
    );
    expect(page).toMatchObject({ state: 'unavailable' });
  });
});

describe('the Discord voice channel picker', () => {
  it('lists only voice and stage channels of every server', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${GUILD}/channels`, [
      { id: '300000000000000010', type: 0, name: 'general' },
      { id: '300000000000000011', type: 2, name: 'Living room' },
      { id: '300000000000000012', type: 13, name: 'Town hall' },
      { id: '300000000000000013', type: 4, name: 'Category' },
    ]);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/channels`, [
      { id: '300000000000000020', type: 2, name: 'Garage' },
    ]);
    const page = ready(await discordPicker('voice_channels', () => world)({}, OWNER_CALLER));
    expect(page.options.map((option) => [option.id, option.label, option.detail])).toEqual([
      ['300000000000000020', '#Garage', 'Workshop'],
      ['300000000000000011', '#Living room', 'Home'],
      ['300000000000000012', '#Town hall', 'Home'],
    ]);
  });

  it('names a chosen voice channel by id', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${GUILD}/channels`, [
      { id: '300000000000000011', type: 2, name: 'Living room' },
    ]);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/channels`, []);
    const page = ready(
      await discordPicker('voice_channels', () => world)(
        { ids: '300000000000000011' },
        OWNER_CALLER,
      ),
    );
    expect(page.options.map((option) => option.label)).toEqual(['#Living room']);
  });

  it('says why when Discord is not connected', async () => {
    const { world } = picking(false);
    expect(await discordPicker('voice_channels', () => world)({}, OWNER_CALLER)).toMatchObject({
      state: 'unavailable',
    });
  });
});

describe('the Discord emoji picker', () => {
  it('lists the custom emoji of every server with the name:id form reactions use', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${GUILD}/emojis`, [
      { id: '600000000000000001', name: 'party', animated: true },
      { id: '600000000000000002', name: 'heart' },
    ]);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/emojis`, []);
    const page = ready(await discordPicker('emojis', () => world)({}, OWNER_CALLER));
    const custom = page.options.filter((option) => option.image !== null);
    expect(custom.map((option) => [option.id, option.label, option.image])).toEqual([
      [
        'party:600000000000000001',
        ':party:',
        'https://cdn.discordapp.com/emojis/600000000000000001.gif?size=64',
      ],
      [
        'heart:600000000000000002',
        ':heart:',
        'https://cdn.discordapp.com/emojis/600000000000000002.png?size=64',
      ],
    ]);
  });

  it('names a chosen emoji from its name:id and filters by typed text', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${GUILD}/emojis`, [
      { id: '600000000000000001', name: 'party' },
      { id: '600000000000000002', name: 'heart' },
    ]);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/emojis`, []);
    const picker = discordPicker('emojis', () => world);
    expect(
      ready(
        await picker({ ids: 'heart:600000000000000002,gone:600000000000000009' }, OWNER_CALLER),
      ).options.map((option) => option.id),
    ).toEqual(['heart:600000000000000002']);
    expect(
      ready(await picker({ q: ':par' }, OWNER_CALLER)).options.map((option) => option.label),
    ).toEqual([':party:']);
  });

  it('also offers the unicode emoji, found by name and chosen by the character itself', async () => {
    const { world, rest } = picking();
    rest.answer('GET', `/guilds/${GUILD}/emojis`, []);
    rest.answer('GET', `/guilds/${OTHER_GUILD}/emojis`, []);
    const picker = discordPicker('emojis', () => world);
    expect(
      ready(await picker({ q: 'thumbs up' }, OWNER_CALLER)).options.map((option) => option.id),
    ).toContain('👍');
    expect(
      ready(await picker({ q: 'white heavy check mark' }, OWNER_CALLER)).options.map((o) => o.id),
    ).toEqual(['✅']);
    expect(
      ready(await picker({ ids: '👍,not an emoji' }, OWNER_CALLER)).options.map(
        (option) => option.id,
      ),
    ).toEqual(['👍']);
  });
});
