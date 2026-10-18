import { CommandRefusedError, ROBOT_ACTION_CAPABILITY, ROBOT_MODES } from '@smarteverything/domain';
import type { DeviceCommand } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { aibiTools } from '../../../src/plugins/builtin/aibi/aibi-tools';
import { performAction } from '../../../src/plugins/builtin/aibi/robot-device';
import {
  AIBI_PORTS,
  AIBI_SETTINGS,
  DEFAULT_PERSONALITY,
} from '../../../src/plugins/builtin/aibi/settings';
import { AIBI_SETTINGS_FORM } from '../../../src/plugins/builtin/aibi/settings-form';

const COMMAND_ID = '6f1f4e8e-8a4a-4a83-9d51-3a6e3f9f3a10';

function moveCommand(): DeviceCommand {
  return {
    commandId: COMMAND_ID,
    externalId: 'robot:aibi',
    capability: ROBOT_ACTION_CAPABILITY,
    value: { action: 'wave' },
  };
}

function deskPlaying(played: boolean): { readonly seen: string[]; playAction: () => boolean } {
  const seen: string[] = [];
  return {
    seen,
    playAction: (): boolean => {
      seen.push('played');
      return played;
    },
  };
}

const OWNER = {
  profileId: 'owner',
  role: 'owner',
  chatId: null,
  via: 'chat',
  clientId: null,
} as const;

function tools(startOver: () => Promise<boolean>): ReturnType<typeof aibiTools> {
  return aibiTools({
    status: () => {
      throw new Error('not used');
    },
    moves: () => ({ actions: [], animations: 0 }),
    activity: { recent: () => [] },
    desk: { result: () => ({ spoken: false }) },
    assistant: { startOver },
  });
}

describe('AIBI device command', () => {
  it('moves AIBI during a conversation with no scope setting', () => {
    const desk = deskPlaying(true);
    expect(performAction(moveCommand(), desk)).toMatchObject({ queued: true });
    expect(desk.seen).toStrictEqual(['played']);
  });

  it('says AIBI must be talking when no conversation is open', () => {
    expect(() => performAction(moveCommand(), deskPlaying(false))).toThrow(CommandRefusedError);
  });

  it('refuses any other capability', () => {
    expect(() =>
      performAction({ ...moveCommand(), capability: 'power' }, deskPlaying(true)),
    ).toThrow('AIBI only moves or acts');
  });
});

describe('AIBI settings', () => {
  it('loads stored settings that still carry the old scopes and ports', () => {
    const parsed = AIBI_SETTINGS.parse({
      owner_name: 'Sam',
      scopes: [],
      http_port: 8080,
      https_port: 8443,
      dns_port: 5353,
    });
    expect(parsed.owner_name).toBe('Sam');
    expect(Object.keys(parsed)).not.toContain('scopes');
    expect(Object.keys(parsed)).not.toContain('http_port');
    expect(Object.keys(parsed)).not.toContain('https_port');
    expect(Object.keys(parsed)).not.toContain('dns_port');
  });

  it('defaults every setting from an empty store', () => {
    const parsed = AIBI_SETTINGS.parse({});
    expect(parsed.personality).toBe(DEFAULT_PERSONALITY);
    expect(ROBOT_MODES).toContain(parsed.mode);
  });

  it('shows no scope or port fields and keeps the form and schema in step', () => {
    const keys = Object.keys(AIBI_SETTINGS_FORM);
    expect(keys).not.toContain('scopes');
    expect(keys.filter((key) => key.endsWith('_port'))).toStrictEqual([]);
    const schemaKeys = Object.keys(AIBI_SETTINGS.parse({}));
    expect(schemaKeys.toSorted()).toStrictEqual(keys.toSorted());
  });

  it('listens on the standard ports the manifest permits', () => {
    expect(AIBI_PORTS).toStrictEqual({ http: 80, https: 443, dns: 53 });
  });
});

describe('AIBI assistant tools', () => {
  it('reads and forgets with only the plugin and its roles in play', async () => {
    let remaining = 2;
    const all = tools(() => {
      remaining -= 1;
      return Promise.resolve(remaining >= 0);
    });
    const read = all.find((tool) => tool.name === 'read');
    const forget = all.find((tool) => tool.name === 'forget');
    expect((await read?.run({ view: 'actions' }, OWNER))?.response).toStrictEqual({
      actions: [],
      animations: 0,
    });
    expect((await forget?.run({}, OWNER))?.response).toStrictEqual({ forgotten: 2 });
  });
});
