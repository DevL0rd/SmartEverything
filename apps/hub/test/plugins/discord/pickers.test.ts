import { describe, expect, it } from 'vitest';
import { PLUGIN_OPTION_PAGE, type PluginOptionPage } from '@smarteverything/domain';
import { discordPicker, type PickerWorld } from '../../../src/plugins/builtin/discord/pickers';
import { GUILD, GUEST_ID, OWNER_ID, worldOf } from './fakes';

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
    const page = ready(await discordPicker('roles', () => world)({}));
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
      await discordPicker('roles', () => world)({ ids: '500000000000000001,not-an-id' }),
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
    const page = ready(await discordPicker('roles', () => world)({ q: 'gue' }));
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
    const first = ready(await picker({}));
    const second = ready(await picker({ after: first.next ?? '' }));
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
    const page = ready(await discordPicker('people', () => world)({ ids: OWNER_ID }));
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
    const page = ready(await discordPicker('people', () => world)({ ids: ids.join(',') }));
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
    const page = ready(await discordPicker('channels', () => world)({}));
    expect(page.options.map((option) => [option.label, option.detail])).toEqual([
      ['#general', 'Home'],
      ['#plans', 'Thread · Home'],
    ]);
  });
});

describe('the Discord servers picker', () => {
  it('lists the servers the bot is in, sorted by name', async () => {
    const { world } = picking();
    const page = ready(await discordPicker('servers', () => world)({}));
    expect(page.options.map((option) => option.label)).toEqual(['Home', 'Workshop']);
  });
});

describe('a Discord picker with no live connection', () => {
  it('says Discord is not connected instead of listing nothing', async () => {
    const { world } = picking(false);
    const page = PLUGIN_OPTION_PAGE.parse(await discordPicker('roles', () => world)({}));
    expect(page).toMatchObject({ state: 'unavailable' });
    const none = PLUGIN_OPTION_PAGE.parse(await discordPicker('roles', () => null)({}));
    expect(none.state).toBe('unavailable');
  });

  it('reports why Discord would not list instead of throwing', async () => {
    const { world } = picking();
    const page = PLUGIN_OPTION_PAGE.parse(await discordPicker('roles', () => world)({}));
    expect(page).toMatchObject({ state: 'unavailable' });
  });
});
