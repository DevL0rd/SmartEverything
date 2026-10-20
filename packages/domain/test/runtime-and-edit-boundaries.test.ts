import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from '../src/api/endpoints';
import { callAudioWith, CLIENT_PREFS } from '../src/client-prefs';
import { HUB_DISCOVERY_CANDIDATE, HUB_ENDPOINT } from '../src/hub-connections';
import { IMAGE_WAIT_REQUEST } from '../src/image-operations';
import { servedComputerTool } from '../src/mcp/catalogue-computers';
import { NODE_REPORT, NODE_SAMPLE } from '../src/node/report';
import { DEFAULT_PAUSE_MS } from '../src/voice-activity';

const ID = '3a000000-0000-4000-8000-0000000000a1';
const OTHER = '3a000000-0000-4000-8000-0000000000a2';

const SCOPE = {
  version: 1,
  profile_id: ID,
  client_id: null,
  chat_id: ID,
  device_id: ID,
  runtime: 'claude',
  session_id: 's1',
  job_id: ID,
  process_generation: ID,
  cwd: '/work',
  connection_generation: ID,
  capability_revision: 'r',
  catalogue_revision: 'r',
};

describe('computer runtime requests', () => {
  const read = API_ENDPOINTS.readComputerRuntimeState.body;
  const execute = API_ENDPOINTS.executeComputerRuntime.body;

  it('reads a public state operation and keeps native command reads to their own endpoint', () => {
    expect(read.safeParse({ runtime: 'claude', request: { operation: 'status' } }).success).toBe(
      true,
    );
    const parsed = read.safeParse({
      runtime: 'claude',
      request: { operation: 'provider_commands', scope: SCOPE },
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(
      'Native commands require their dedicated caller-bound endpoint.',
    );
  });

  it('runs a mutation only with an operation id', () => {
    const call = { operation: 'native_tools_call', session_id: 's1', name: 'tool', arguments: {} };
    expect(
      execute.safeParse({ runtime: 'claude', request: { ...call, operation_id: ID } }).success,
    ).toBe(true);
    const missing = execute.safeParse({ runtime: 'claude', request: call });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toBe('Native mutation requires an operation_id.');
    expect(
      execute.safeParse({ runtime: 'claude', request: { operation: 'install_link' } }).success,
    ).toBe(false);
  });
});

describe('editing a chat message', () => {
  const edit = API_ENDPOINTS.editAiChatMessage.body;

  it('keeps reference spans in line with the new text', () => {
    const reference = {
      reference: { kind: 'chat', chat_id: ID },
      label: 'Chat',
      token: '@chat',
      start: 0,
      end: 5,
    };
    expect(edit.safeParse({ text: '@chat hello', references: [reference] }).success).toBe(true);
    const moved = edit.safeParse({ text: 'hello @chat', references: [reference] });
    expect(moved.success).toBe(false);
    expect(moved.error?.issues[0]?.message).toBe('Reference spans must match the submitted text.');
    expect(edit.safeParse({ text: '   ' }).success).toBe(false);
  });
});

describe('image waiting', () => {
  it('asks for each operation once', () => {
    expect(IMAGE_WAIT_REQUEST.safeParse({ operation_ids: [ID, OTHER] }).success).toBe(true);
    expect(IMAGE_WAIT_REQUEST.safeParse({ operation_ids: [ID, ID] }).success).toBe(false);
    expect(IMAGE_WAIT_REQUEST.safeParse({}).success).toBe(true);
  });
});

describe('hub addresses', () => {
  it('takes only secure addresses for a LAN endpoint and a discovered candidate', () => {
    expect(HUB_ENDPOINT.safeParse({ kind: 'lan', url: 'https://192.168.1.5:8443' }).success).toBe(
      true,
    );
    expect(HUB_ENDPOINT.safeParse({ kind: 'lan', url: 'http://192.168.1.5:8443' }).success).toBe(
      false,
    );
    expect(
      HUB_DISCOVERY_CANDIDATE.safeParse({ name: 'Hub', url: 'https://192.168.1.5:8443' }).success,
    ).toBe(true);
    expect(
      HUB_DISCOVERY_CANDIDATE.safeParse({ name: 'Hub', url: 'http://192.168.1.5:8443' }).success,
    ).toBe(false);
  });
});

describe('what a computer reports', () => {
  it('names only catalogued or raw capabilities', () => {
    const sample = { key: 'cpu_load', value: 1, at: '2026-10-08T07:00:00Z' };
    expect(NODE_SAMPLE.safeParse({ ...sample, key: 'raw:thing' }).success).toBe(true);
    expect(NODE_SAMPLE.safeParse({ ...sample, key: 'nonsense' }).success).toBe(false);
    expect(
      NODE_REPORT.safeParse({ at: sample.at, values: { 'raw:thing': 1 }, events: [] }).success,
    ).toBe(true);
    expect(
      NODE_REPORT.safeParse({ at: sample.at, values: { nonsense: 1 }, events: [] }).success,
    ).toBe(false);
  });
});

describe('served computer tools', () => {
  it('serves a computer tool with its area and text, and refuses a tool with no text', () => {
    const [name, area] = servedComputerTool('list_processes', { part: 'list_processes' });
    expect(name).toBe('list_processes');
    expect(area).toBe('computers');
    expect(() => servedComputerTool('list_rooms', { part: 'list_rooms' })).toThrow(
      'No computer tool text for list_rooms',
    );
  });
});

describe('the older call audio value', () => {
  const { call_audio: callAudio } = CLIENT_PREFS;

  it('adds the home pause to the device value', () => {
    expect(callAudioWith(callAudio.defaultValue, DEFAULT_PAUSE_MS)).toStrictEqual({
      ...callAudio.defaultValue,
      pause_ms: DEFAULT_PAUSE_MS,
    });
  });

  it('refuses a version 1 envelope whose value is not an object, and any other version', () => {
    expect(callAudio.decode({ version: 1, value: 'loud' }).status).toBe('invalid');
    expect(callAudio.decode({ version: 3, value: callAudio.defaultValue }).status).toBe('invalid');
  });
});
