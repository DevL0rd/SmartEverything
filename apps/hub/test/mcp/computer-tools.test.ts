import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  API_ENDPOINTS,
  DEFAULT_COMPUTER_SCOPES,
  MCP_ROUTES,
  PROCESS_QUERY,
  type AudioState,
  type ClientRow,
  type ComputerSummary,
  type DisplayState,
  type EndpointName,
  type ProfileRow,
  type SystemState,
  type TilingState,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { FILES_INPUT, changeFiles } from '../../src/extensions/mcp/tools/computer-files-tool';
import {
  changeAudio,
  changeDisplay,
  changeSystem,
  changeWindow,
} from '../../src/extensions/mcp/tools/computer-controls';
import {
  compactDisplays,
  compactNow,
  compactTiling,
} from '../../src/extensions/mcp/tools/computer-compact';
import { endProgram, listPrograms } from '../../src/extensions/mcp/tools/computer-programs';
import { computerNow, readState } from '../../src/extensions/mcp/tools/computer-reads';
import { toolNamed } from '../../src/extensions/mcp/tools';
import type { Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const DEVICE = randomUUID();

interface Call {
  readonly name: EndpointName;
  readonly caller: Caller;
  readonly params: Record<string, string>;
  readonly body: unknown;
  readonly query: Record<string, unknown>;
}

const AUDIO: AudioState = {
  outputs: [
    {
      id: 'sink-1',
      name: 'Speakers',
      kind: 'speakers',
      isDefault: true,
      available: true,
      volume: 40.4,
      muted: false,
      maxVolume: 100,
      batteryPercent: null,
      usedBy: [],
    },
  ],
  inputs: [],
  apps: [
    {
      streamId: 'stream-9',
      app: 'Spotify',
      icon: null,
      volume: 40,
      muted: false,
      outputId: 'sink-1',
    },
  ],
};

const DISPLAYS: DisplayState = {
  outputs: [
    {
      id: 'DP-1',
      name: 'Dell',
      builtIn: false,
      enabled: true,
      primary: true,
      mode: { width: 2560, height: 1440, refreshHz: 165, preferred: true },
      modes: [
        { width: 2560, height: 1440, refreshHz: 165, preferred: true },
        { width: 1920, height: 1080, refreshHz: 60, preferred: false },
      ],
      scalePercent: 100,
      rotation: 0,
      x: 0,
      y: 0,
      brightness: 70,
      hdr: { supported: false, enabled: false },
      vrr: null,
      mirrorOf: null,
    },
  ],
  nightLight: { supported: true, mode: 'off', active: false, temperatureKelvin: null },
  pendingRevert: {
    token: 'token-1',
    startedAt: '2026-10-17T12:00:00.000Z',
    revertsAt: '2026-10-17T12:00:15.000Z',
    summary: 'Resolution changed',
  },
};

const SUMMARY: ComputerSummary = {
  cpuLoad: 12,
  cpuTemperature: null,
  memoryPercent: 25,
  swapPercent: null,
  gpuLoad: null,
  gpuTemperature: null,
  gpuMemoryPercent: null,
  cpuWatts: null,
  gpuWatts: null,
  downloadRate: 0,
  uploadRate: 0,
  fullestDisk: null,
  batteryLevel: null,
  charging: null,
  totalWatts: null,
  processCount: 0,
  uptimeSeconds: 60,
};

const SYSTEM: SystemState = {
  battery: {
    level: 81.2,
    state: 'charging',
    pluggedIn: true,
    minutesLeft: 90,
    healthPercent: null,
    drawWatts: null,
  },
  powerMode: { current: 'balanced', offered: ['power_saver', 'balanced', 'performance'] },
  dnd: false,
  keyboard: { layouts: [{ id: 'us', name: 'English (US)' }], current: 'us' },
  wifi: {
    enabled: true,
    networks: [{ ssid: 'Home', signalPercent: 80, secured: true, known: true, connected: true }],
  },
  bluetooth: {
    enabled: true,
    devices: [{ id: 'bt1', name: 'Buds', connected: true, batteryPercent: 50 }],
  },
  usb: [{ id: 'usb1', name: 'Keyboard', vendor: 'Acme', speedMbps: 480 }],
};

const TILING: TilingState = {
  overviewOpen: false,
  outputs: [{ name: 'DP-1', width: 2560, height: 1440 }],
  workspaces: [
    {
      id: 4,
      index: 1,
      name: 'code',
      output: 'DP-1',
      active: true,
      focused: true,
      urgent: false,
      activeWindowId: 7,
      columns: [
        { display: 'normal', windowIds: [7, 9] },
        { display: 'tabbed', windowIds: [11] },
      ],
    },
    {
      id: 5,
      index: 2,
      name: null,
      output: 'DP-1',
      active: false,
      focused: false,
      urgent: true,
      activeWindowId: null,
      columns: [],
    },
  ],
  windows: [
    {
      id: 7,
      title: 'main.ts',
      appId: 'org.kde.kate',
      workspaceId: 4,
      focused: true,
      floating: false,
      urgent: false,
    },
    {
      id: 9,
      title: 'Terminal',
      appId: 'org.example.terminal',
      workspaceId: 5,
      focused: false,
      floating: true,
      urgent: true,
    },
  ],
};

const ANSWERS: Partial<Record<EndpointName, unknown>> = {
  readComputerTiling: TILING,
  changeComputerAudio: AUDIO,
  readComputerAudio: AUDIO,
  changeComputerDisplay: DISPLAYS,
  confirmComputerDisplay: { ...DISPLAYS, pendingRevert: null },
  changeComputerSystem: SYSTEM,
  readComputerSystem: SYSTEM,
  changeComputerStartup: {
    entries: [{ id: 'a', name: 'Steam', command: 'steam', enabled: false, global: false }],
  },
  changeComputerService: { services: [], timers: [] },
  readComputer: {
    deviceId: DEVICE,
    online: true,
    at: '2026-10-17T12:00:00.000Z',
    features: [],
    parts: { summary: SUMMARY },
    scopes: DEFAULT_COMPUTER_SCOPES,
    actions: [],
    machineActions: [],
    permissions: [],
  },
  changeComputerWindow: { windows: [] },
  signalComputerProcess: { done: true },
  prioritiseComputerProcess: { done: true },
  listComputerProcesses: {
    at: '2026-10-17T12:00:00.000Z',
    total: 1,
    next: null,
    processes: [
      {
        pid: 42,
        start: 1,
        ppid: 1,
        name: 'firefox',
        command: 'firefox --long-flag',
        user: 'sam',
        state: 'running',
        cpu: 12.345,
        memoryBytes: 1000,
        gpu: null,
        diskRate: 0,
        threads: 4,
        descendants: 0,
        own: true,
      },
    ],
  },
  writeComputerFiles: {
    done: [{ path: '/home/sam/a', newPath: null, trashId: 'trash-1' }],
    failed: [],
  },
  uploadComputerFile: { path: '/home/sam/up.txt', size: 5, complete: true },
};

let opened: TestStore;
let calls: Call[];
let owner: ClientRow;
let ownerProfile: ProfileRow;
let context: OperatingContext & { readonly assistantFiles: string };
let directory: string;

function operating(client: ClientRow, profile: ProfileRow): typeof context {
  return {
    store: opened.store,
    caller: null,
    actor: { clientId: client.id, profileId: profile.id, chatId: null },
    assistantFiles: directory,
    operations: {
      run: (name, caller, input): Promise<unknown> => {
        const endpoint = API_ENDPOINTS[name];
        endpoint.params.parse(input.params ?? {});
        if (input.body !== undefined) endpoint.body.parse(input.body);
        calls.push({
          name,
          caller,
          params: input.params ?? {},
          body: input.body,
          query: input.query ?? {},
        });
        return Promise.resolve(ANSWERS[name]);
      },
    },
  };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  directory = await mkdtemp(join(tmpdir(), 'computer-tools-'));
  calls = [];
  ownerProfile = opened.store.profiles.first();
  owner = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  context = operating(owner, ownerProfile);
});

afterEach(async () => {
  await opened.close();
  await rm(directory, { recursive: true, force: true });
});

describe('the sound tool', () => {
  it('sends the change to its computer and answers with the compact sound state', async () => {
    const answer = await changeAudio(context, {
      deviceId: DEVICE,
      change: { action: 'app_volume', app: 'Spotify', level: 40 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('changeComputerAudio');
    expect(calls[0]?.params).toEqual({ deviceId: DEVICE });
    expect(answer).toEqual({
      ok: true,
      summary: 'Spotify set to 40 %',
      state: {
        outputs: [{ id: 'sink-1', name: 'Speakers', default: true, volume: 40, muted: false }],
        inputs: [],
        apps: [
          { streamId: 'stream-9', app: 'Spotify', volume: 40, muted: false, output: 'Speakers' },
        ],
      },
    });
  });

  it('acts as the person who asked', async () => {
    const member = opened.store.profiles.create({ name: 'Robin' });
    const paired = opened.store.clients.create({
      name: 'Member phone',
      platform: 'android',
      role: 'member',
      tokenHash: 'b'.repeat(64),
    });
    const client = opened.store.clients.useProfile(paired.id, member.id);
    await changeAudio(operating(client, member), {
      deviceId: DEVICE,
      change: { action: 'mute', muted: true, kind: 'input' },
    });
    const caller = calls[0]?.caller;
    expect(caller?.kind === 'client' ? caller.client.role : null).toBe('member');
    expect(caller?.kind === 'client' ? caller.profileId : null).toBe(member.id);
  });
});

describe('the screen tool', () => {
  it('says when a risky change reverts and sends keep as a confirmation', async () => {
    const answer = await changeDisplay(context, {
      deviceId: DEVICE,
      change: { action: 'mode', output: 'Dell', width: 1920, height: 1080 },
    });
    expect(calls[0]?.name).toBe('changeComputerDisplay');
    expect(answer['summary']).toMatch(
      /^Dell set to 1920x1080\. Reverts at \d\d:\d\d:\d\d unless kept$/,
    );
    const kept = await changeDisplay(context, { deviceId: DEVICE, change: { action: 'keep' } });
    expect(calls[1]?.name).toBe('confirmComputerDisplay');
    expect(calls[1]?.body).toEqual({ keep: true });
    expect(kept['summary']).toBe('Screen change kept');
    await changeDisplay(context, { deviceId: DEVICE, change: { action: 'revert' } });
    expect(calls[2]?.body).toEqual({ keep: false });
  });

  it('lists resolutions only when asked', () => {
    const plain = compactDisplays(DISPLAYS, false);
    const full = compactDisplays(DISPLAYS, true);
    expect(JSON.stringify(plain)).not.toContain('1920x1080');
    expect(JSON.stringify(full)).toContain('1920x1080@60');
    expect(JSON.stringify(plain)).toContain('2560x1440@165');
  });
});

describe('the system tool', () => {
  it('routes each action to the endpoint that owns it', async () => {
    await changeSystem(context, { deviceId: DEVICE, change: { action: 'dnd', enabled: true } });
    await changeSystem(context, {
      deviceId: DEVICE,
      change: { action: 'startup_app', id: 'a', enabled: false },
    });
    await changeSystem(context, {
      deviceId: DEVICE,
      change: { action: 'service', unit: 'sshd.service', operation: 'restart' },
    });
    expect(calls.map((call) => call.name)).toEqual([
      'changeComputerSystem',
      'changeComputerStartup',
      'changeComputerService',
    ]);
  });

  it('reads the system view in the compact form', async () => {
    const state = await readState(
      context,
      'readComputerSystem',
      DEVICE,
      API_ENDPOINTS.readComputerSystem.response,
    );
    expect(calls[0]?.name).toBe('readComputerSystem');
    expect(state.battery?.level).toBe(81.2);
  });
});

describe('windows, programs and files', () => {
  it('acts on one window by its id', async () => {
    await changeWindow(context, DEVICE, 'w1', 'minimise');
    expect(calls[0]?.body).toEqual({ windowId: 'w1', action: 'minimise' });
  });

  it('lists programs compactly with the query the endpoint accepts', async () => {
    const answer = await listPrograms(context, {
      deviceId: DEVICE,
      sort: 'memory',
      tree: true,
      search: 'fire',
    });
    expect(PROCESS_QUERY.parse(calls[0]?.query)).toMatchObject({
      sort: 'memory',
      tree: true,
      search: 'fire',
    });
    expect(JSON.stringify(answer)).not.toContain('long-flag');
    expect(answer['total']).toBe(1);
  });

  it('sets a priority or sends a signal', async () => {
    await endProgram(context, { deviceId: DEVICE, pid: 42, signal: 'priority', nice: 10 });
    await endProgram(context, { deviceId: DEVICE, pid: 42, signal: 'force' });
    expect(calls.map((call) => call.name)).toEqual([
      'prioritiseComputerProcess',
      'signalComputerProcess',
    ]);
    expect(calls[0]?.params).toEqual({ deviceId: DEVICE, pid: '42' });
    expect(calls[0]?.body).toEqual({ nice: 10 });
  });

  it('reports a file change with only the facts that apply', async () => {
    const answer = await changeFiles(context, {
      deviceId: DEVICE,
      change: { action: 'trash', paths: ['/home/sam/a'] },
    });
    expect(answer).toEqual({
      ok: true,
      summary: '1 done',
      done: [{ path: '/home/sam/a', trashId: 'trash-1' }],
    });
  });

  it('saves a chat attachment onto the computer', async () => {
    const id = randomUUID();
    await writeFile(join(directory, 'up.txt'), 'hello');
    opened.store.assistantChat.addAttachment({
      id,
      profile_id: ownerProfile.id,
      name: 'up.txt',
      mime: 'text/plain',
      bytes: 5,
      width: null,
      height: null,
      storage_path: 'up.txt',
      sha256: 'c'.repeat(64),
    });
    const answer = await changeFiles(
      context,
      FILES_INPUT.parse({
        deviceId: DEVICE,
        action: 'upload',
        attachmentId: id,
        path: '/home/sam/up.txt',
      }),
    );
    expect(calls[0]?.name).toBe('uploadComputerFile');
    expect(calls[0]?.body).toEqual({
      path: '/home/sam/up.txt',
      start: 0,
      data: Buffer.from('hello').toString('base64'),
      final: true,
      replace: false,
    });
    expect(answer['summary']).toBe('Saved /home/sam/up.txt (5 bytes)');
  });
});

describe('the served tools', () => {
  it('shows one flat input with the action and every field of every action', () => {
    const listing = toolNamed('set_computer_display')?.listing;
    const properties = JSON.stringify(listing?.inputSchema);
    expect(properties).toContain('"night_light"');
    expect(properties).toContain('"keep"');
    expect(properties).toContain('"revert"');
    expect(properties).not.toContain('"identify"');
    expect(properties).toContain('refreshHz');
  });

  it('names the missing field of the chosen action in a refusal', () => {
    const parsed = toolNamed('set_computer_display')?.input?.safeParse({
      deviceId: DEVICE,
      action: 'mode',
      output: 'Dell',
    });
    expect(parsed?.success).toBe(false);
    expect(parsed?.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['width', 'height']);
  });

  it('marks reads as reads and destructive tools as destructive', () => {
    const marks = (name: string): unknown => toolNamed(name)?.listing.annotations;
    expect(marks('get_computer')).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(marks('list_processes')).toMatchObject({ readOnlyHint: true });
    expect(marks('end_process')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(marks('edit_computer_files')).toMatchObject({ destructiveHint: true });
    expect(marks('set_computer_audio')).toMatchObject({ readOnlyHint: false });
    expect(marks('set_computer_system')).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it('serves each view of get_computer and each window action', () => {
    expect(MCP_ROUTES.get('get_computer')).toMatchObject({
      parts: { audio: 'get_computer_audio', startup: 'get_computer_startup' },
    });
    expect(MCP_ROUTES.get('run_computer_app')).toMatchObject({
      parts: { window_focus: 'focus_window', window_close: 'close_window' },
    });
  });
});

describe('the tiling view', () => {
  it('reads the layout from its endpoint and lists screens, workspaces, columns and windows compactly', async () => {
    const state = await readState(
      context,
      'readComputerTiling',
      DEVICE,
      API_ENDPOINTS.readComputerTiling.response,
    );
    expect(calls[0]?.name).toBe('readComputerTiling');
    expect(compactTiling(state)).toEqual({
      overviewOpen: false,
      screens: [{ name: 'DP-1', width: 2560, height: 1440 }],
      workspaces: [
        {
          index: 1,
          name: 'code',
          screen: 'DP-1',
          shown: true,
          focused: true,
          columns: [{ windows: [7, 9] }, { windows: [11], tabbed: true }],
        },
        { index: 2, name: null, screen: 'DP-1', urgent: true, columns: [] },
      ],
      windows: [
        { windowId: 7, title: 'main.ts', app: 'org.kde.kate', workspace: 'code', focused: true },
        {
          windowId: 9,
          title: 'Terminal',
          app: 'org.example.terminal',
          workspace: 2,
          floating: true,
          urgent: true,
        },
      ],
    });
  });

  it('is a view of get_computer', () => {
    expect(MCP_ROUTES.get('get_computer')).toMatchObject({
      parts: { windows: 'get_computer_windows', tiling: 'get_computer_tiling' },
    });
  });
});

describe('the computer summary', () => {
  it('drops the sound, screens and program parts that have their own views', () => {
    const detail = API_ENDPOINTS.readComputer.response.parse({
      deviceId: DEVICE,
      online: true,
      at: '2026-10-17T12:00:00.000Z',
      features: [],
      parts: { audio: AUDIO, displays: DISPLAYS, system: SYSTEM },
      scopes: DEFAULT_COMPUTER_SCOPES,
      actions: [],
      machineActions: [],
      permissions: [],
    });
    const now = compactNow(detail);
    expect(now['battery']).toBeNull();
    expect(JSON.stringify(now['parts'])).not.toContain('Speakers');
    expect(now['summary']).toBe('No readings yet');
  });

  it('reports the battery from the fresh summary, not from the system part read earlier', () => {
    const detail = API_ENDPOINTS.readComputer.response.parse({
      deviceId: DEVICE,
      online: true,
      at: '2026-10-17T12:00:00.000Z',
      features: [],
      parts: {
        system: SYSTEM,
        summary: { ...SUMMARY, batteryLevel: 23.4, charging: false },
      },
      scopes: DEFAULT_COMPUTER_SCOPES,
      actions: [],
      machineActions: [],
      permissions: [],
    });
    expect(compactNow(detail)['battery']).toEqual({ level: 23, charging: false });
  });

  it('asks the hub for a fresh reading of every metric', async () => {
    await computerNow(context, DEVICE);
    expect(calls[0]?.name).toBe('readComputer');
    expect(calls[0]?.query).toEqual({ fresh: 'true' });
  });
});
