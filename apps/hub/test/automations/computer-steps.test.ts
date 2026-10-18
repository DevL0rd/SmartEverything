import {
  API_ENDPOINTS,
  AUTOMATION_RUN_ROW,
  type AudioChange,
  type AudioState,
  type AutomationRunRow,
  type ComputerFeature,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { withExecutionAuthority } from '../../src/assistant/turn-authority';
import { runViewer } from '../../src/automations/computer-steps';
import { CONVERSATION_AUTHORITY } from '../../src/harness/authority-contract';
import { linkFakeProvider } from '../support/booted';
import type { AudioControl } from '../../src/node/controls/session-controls';
import type { Paired } from '../support/paired-computer';
import { guestMember, stubControls, useComputerHub } from '../support/paired-computer';
import { call } from '../support/server';
import { until } from '../support/wait';
import { BOTH, displayRig, type Rig } from '../node/controls/display-rig';

const hub = useComputerHub();

const NO_SOUND: AudioState = { outputs: [], inputs: [], apps: [] };

interface Computer {
  readonly paired: Paired;
  readonly sound: AudioChange[];
  readonly screens: Rig;
}

function audioControl(sound: AudioChange[], features: readonly ComputerFeature[]): AudioControl {
  return {
    features: () => Promise.resolve(features),
    read: () => Promise.resolve(NO_SOUND),
    watch: (): (() => void) => () => undefined,
    change: (change): Promise<AudioState> => {
      sound.push(change);
      return Promise.resolve(NO_SOUND);
    },
  };
}

async function computer(
  options: { readonly applies?: boolean; readonly sound?: readonly ComputerFeature[] } = {},
): Promise<Computer> {
  const paired = await hub.pair();
  const sound: AudioChange[] = [];
  const screens = displayRig(BOTH, { applies: options.applies ?? true });
  hub.run(
    paired,
    stubControls({
      audio: audioControl(sound, options.sound ?? ['audio', 'audio_apps']),
      displays: screens.displays,
    }),
  );
  await until(async () => {
    const reply = await call(hub.booted().base, hub.booted().owner, {
      method: 'GET',
      path: `/api/computers/${paired.deviceId}`,
    });
    return reply.status === 200 && API_ENDPOINTS.readComputer.response.parse(reply.body).online;
  }, 'the computer to come online');
  await until(async () => {
    const reply = await call(hub.booted().base, hub.booted().owner, {
      method: 'GET',
      path: `/api/computers/${paired.deviceId}`,
    });
    return API_ENDPOINTS.readComputer.response.parse(reply.body).features.length > 0;
  }, 'the computer to say what it can do');
  return { paired, sound, screens };
}

function save(token: string, steps: readonly unknown[]): ReturnType<typeof call> {
  return call(hub.booted().base, token, {
    method: 'POST',
    path: '/api/automations',
    body: { name: 'Computer steps', definition: { when: [], steps } },
  });
}

async function run(steps: readonly unknown[]): Promise<AutomationRunRow> {
  const { base, owner } = hub.booted();
  const saved = await save(owner, steps);
  expect(saved.status).toBe(200);
  const id = API_ENDPOINTS.createAutomation.response.parse(saved.body).id;
  const reply = await call(base, owner, {
    method: 'POST',
    path: `/api/automations/${id}/run`,
    body: { wait: true },
  });
  expect(reply.status).toBe(200);
  return AUTOMATION_RUN_ROW.parse(reply.body);
}

function displayStep(
  paired: Paired,
  change: Record<string, unknown>,
  keep?: boolean,
): Record<string, unknown> {
  return {
    do: 'display',
    computer: paired.deviceId,
    change,
    ...(keep === undefined ? {} : { keep }),
  };
}

function mode(paired: Paired, width: number, height: number, keep?: boolean): unknown {
  return displayStep(paired, { action: 'mode', output: 'DP-3', width, height }, keep);
}

function onComputer(paired: Paired, step: Record<string, unknown>): unknown {
  return { ...step, computer: paired.deviceId };
}

function noteOf(row: AutomationRunRow): string | null {
  return row.trace.at(-1)?.error ?? null;
}

describe('per-app sound steps', () => {
  it('change one app’s volume, mute and output on the computer', async () => {
    const { paired, sound } = await computer();
    const row = await run([
      onComputer(paired, {
        do: 'audio',
        change: { action: 'app_volume', app: 'Spotify', level: 30 },
      }),
      onComputer(paired, {
        do: 'audio',
        change: { action: 'app_mute', app: 'Firefox', muted: true },
      }),
      onComputer(paired, {
        do: 'audio',
        change: { action: 'app_output', app: 'Spotify', output: 'Headset' },
      }),
    ]);
    expect(row.status).toBe('succeeded');
    expect(sound).toEqual([
      { action: 'app_volume', app: 'Spotify', level: 30 },
      { action: 'app_mute', app: 'Firefox', muted: true },
      { action: 'app_output', app: 'Spotify', output: 'Headset' },
    ]);
  });

  it('refuse to save a change the computer does not offer', async () => {
    const { paired } = await computer({ sound: ['audio'] });
    const saved = await save(hub.booted().owner, [
      onComputer(paired, {
        do: 'audio',
        change: { action: 'app_mute', app: 'Firefox', muted: true },
      }),
    ]);
    expect(saved.status).toBe(400);
    expect(JSON.stringify(saved.body)).toContain('does not offer audio apps');
  });

  it('refuse to save a step on a device that is not a computer', async () => {
    await computer();
    await linkFakeProvider(hub.booted());
    const { base, owner } = hub.booted();
    const devices = await call(base, owner, { method: 'GET', path: '/api/devices' });
    const lamp = API_ENDPOINTS.listDevices.response
      .parse(devices.body)
      .find((device) => device.kind !== 'computer');
    expect(lamp).toBeDefined();
    const saved = await save(owner, [
      {
        do: 'audio',
        computer: lamp?.id,
        change: { action: 'volume', level: 10, kind: 'output' },
      },
    ]);
    expect(saved.status).toBe(400);
    expect(JSON.stringify(saved.body)).toContain('is not a computer');
  });
});

describe('member scope', () => {
  it('lets a member save steps only on their own computers', async () => {
    const { paired } = await computer();
    const member = await guestMember(hub.booted());
    const saved = await save(member, [
      onComputer(paired, {
        do: 'audio',
        change: { action: 'volume', level: 10, kind: 'output' },
      }),
    ]);
    expect(saved.status).toBe(403);
    expect(JSON.stringify(saved.body)).toContain('own computers');
  });

  it('runs a member’s work as that person and the home’s own as the owner', () => {
    expect(runViewer()).toEqual({ owner: true, profileId: null });
    const authority = CONVERSATION_AUTHORITY.parse({
      event_id: '3a000000-0000-4000-8000-0000000000a1',
      profile_id: '3a000000-0000-4000-8000-0000000000b1',
      client_id: null,
      kind: 'client',
      role: 'member',
      hub_os_ban: false,
      tools: null,
      plugin_id: null,
      requester: null,
    });
    expect(withExecutionAuthority(authority, runViewer)).toEqual({
      owner: false,
      profileId: authority.profile_id,
    });
    expect(withExecutionAuthority({ ...authority, role: 'owner' }, runViewer).owner).toBe(true);
  });
});

describe('unattended screen changes never strand a screen', () => {
  it('put the old mode back after 15 seconds when nobody keeps the change', async () => {
    const { paired, screens } = await computer();
    const row = await run([mode(paired, 1920, 1080)]);
    expect(row.status).toBe('succeeded');
    expect(noteOf(row)).toContain('Goes back after 15 seconds');
    expect(screens.layout()[0]?.mode).toBe('3');
    expect(screens.clock.pending()).toBe(1);
    screens.clock.advance();
    await until(() => screens.layout()[0]?.mode === '1', 'the old mode to come back');
    expect(screens.notices[0]?.closed).toBe(true);
  });

  it('keep a mode the screen really switched to, when the step says keep', async () => {
    const { paired, screens } = await computer();
    const row = await run([mode(paired, 1920, 1080, true)]);
    expect(row.status).toBe('succeeded');
    expect(noteOf(row)).toBeNull();
    expect(screens.layout()[0]?.mode).toBe('3');
    expect(screens.clock.pending()).toBe(0);
    expect(screens.notices[0]?.closed).toBe(true);
  });

  it('revert at once and fail the step when the change did not apply', async () => {
    const { paired, screens } = await computer({ applies: false });
    const row = await run([mode(paired, 1920, 1080, true)]);
    expect(row.status).toBe('failed');
    expect(row.error).toContain('reverted instead of kept');
    expect(row.error).toContain('did not switch to the new mode');
    expect(screens.layout()[0]?.mode).not.toBe('3');
    expect(screens.clock.pending()).toBe(0);
  });

  it('keep two changes in a row because each is settled before the next', async () => {
    const { paired, screens } = await computer();
    const row = await run([
      mode(paired, 1920, 1080, true),
      displayStep(paired, { action: 'scale', output: 'DP-3', percent: 100 }, true),
    ]);
    expect(row.status).toBe('succeeded');
    expect(screens.layout()[0]?.mode).toBe('3');
    expect(screens.clock.pending()).toBe(0);
  });

  it('refuse a second unsettled change instead of stacking it', async () => {
    const { paired, screens } = await computer();
    const row = await run([
      mode(paired, 1920, 1080),
      displayStep(paired, { action: 'scale', output: 'DP-3', percent: 150 }),
    ]);
    expect(row.status).toBe('failed');
    expect(row.error).toContain('Keep or revert the last display change first');
    screens.clock.advance();
    await until(() => screens.layout()[0]?.mode === '1', 'the old mode to come back');
  });

  it('apply brightness and night light directly, with nothing to keep', async () => {
    const { paired, screens } = await computer();
    const row = await run([
      displayStep(paired, { action: 'brightness', level: 40, output: 'DP-3' }),
    ]);
    expect(row.status).toBe('succeeded');
    expect(noteOf(row)).toBeNull();
    expect(screens.calls.some((line) => line.endsWith('output.DP-3.brightness.40'))).toBe(true);
    expect(screens.clock.pending()).toBe(0);
  });
});
