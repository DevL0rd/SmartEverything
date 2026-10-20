import { describe, expect, it } from 'vitest';
import { buildRegistry, nodeCatalogue, registryProblems } from '../../src/automation-nodes';
import { AI_TOOLS_KINDS, AI_WAKE, TOOL_CALL } from '../../src/automation-nodes/ai-tools';
import {
  AUTOMATION_KINDS,
  AUTOMATION_RUN,
  AUTOMATION_STOP,
  FN_CALL,
} from '../../src/automation-nodes/automation';
import {
  COMPUTER_AUDIO,
  COMPUTER_DISPLAY,
  COMPUTERS_PHONES_KINDS,
} from '../../src/automation-nodes/computers-phones';
import {
  DEBUG_BREAKPOINT,
  DEBUG_KINDS,
  DEBUG_LOG,
  DEBUG_NOTE,
} from '../../src/automation-nodes/debug';
import {
  HTTP_AUTH_SCHEMES,
  HTTP_FORBIDDEN_HEADERS,
  HTTP_KINDS,
  HTTP_REQUEST,
  forbiddenHeaderNames,
} from '../../src/automation-nodes/http';
import {
  NOTIFY_FEED,
  NOTIFY_KINDS,
  NOTIFY_PERSON,
  NOTIFY_SPEAK,
} from '../../src/automation-nodes/notify';
import type { NodeKind } from '../../src/automation-nodes';

const ALL: readonly NodeKind[] = [
  ...NOTIFY_KINDS,
  ...COMPUTERS_PHONES_KINDS,
  ...AI_TOOLS_KINDS,
  ...HTTP_KINDS,
  ...AUTOMATION_KINDS,
  ...DEBUG_KINDS,
];

function input(kind: NodeKind, name: string): NodeKind['inputs'][number] | undefined {
  return kind.inputs.find((port) => port.name === name);
}

describe('reach kinds as a registry', () => {
  it('builds without problems', () => {
    expect(registryProblems(ALL)).toEqual([]);
    expect(buildRegistry(ALL).kinds).toHaveLength(20);
  });

  it('gives every effect kind a retry and budget class', () => {
    for (const kind of ALL.filter((candidate) => candidate.class === 'effect')) {
      expect(kind.effect, kind.id).toBeDefined();
    }
  });

  it('ships the breakpoint with the rest', () => {
    const shipped = buildRegistry(ALL)
      .shipped()
      .map((kind) => kind.id);
    expect(shipped).toContain('debug.breakpoint');
    expect(shipped).toContain('debug.note');
    expect(shipped).toContain('notify.ask');
    expect(shipped).toHaveLength(ALL.length);
  });

  it('hides owner kinds from members in the catalogue', () => {
    const registry = buildRegistry(ALL);
    const entries = nodeCatalogue(registry, { caller: 'member' });
    const unavailable = entries.filter((entry) => !entry.available).map((entry) => entry.id);
    expect(unavailable.sort()).toEqual(['ai.wake', 'http.request', 'http.respond', 'tool.call']);
  });
});

describe('notify kinds', () => {
  it('sends to phones within the person budget', () => {
    expect(NOTIFY_PERSON.effect).toEqual({ retry: 'external', budget: 'effects_person' });
    expect(input(NOTIFY_PERSON, 'people')?.required).toBe(true);
    expect(input(NOTIFY_PERSON, 'priority')?.default).toBe('normal');
    expect(NOTIFY_PERSON.outputs.map((port) => port.name)).toEqual(['sent', 'failed']);
    expect(NOTIFY_PERSON.access).toBe('member');
  });

  it('writes the feed note against the effect budget', () => {
    expect(NOTIFY_FEED.effect).toEqual({ retry: 'external', budget: 'effects' });
    expect(NOTIFY_FEED.inputs.map((port) => port.name)).toEqual(['message']);
  });

  it('speaks to a target within the person budget', () => {
    expect(NOTIFY_SPEAK.effect?.budget).toBe('effects_person');
    expect(input(NOTIFY_SPEAK, 'target')?.type).toEqual({ t: 'ref', of: 'target' });
    expect(input(NOTIFY_SPEAK, 'priority')?.default).toBe('queue');
    expect(NOTIFY_SPEAK.outputs.map((port) => port.name)).toEqual(['ok', 'spokenOn']);
  });
});

describe('computer kinds', () => {
  it('changes sound and screen as static changes', () => {
    for (const kind of [COMPUTER_AUDIO, COMPUTER_DISPLAY]) {
      expect(input(kind, 'computer')?.type).toEqual({ t: 'ref', of: 'computer' });
      expect(input(kind, 'change')?.static).toBe(true);
      expect(kind.effect).toEqual({ retry: 'idempotent', budget: 'effects' });
    }
    expect(input(COMPUTER_DISPLAY, 'keep')?.default).toBe(false);
    expect(input(COMPUTER_AUDIO, 'keep')).toBeUndefined();
  });
});

describe('ai and tool kinds', () => {
  it('keeps both owner only and counted as effects', () => {
    for (const kind of [AI_WAKE, TOOL_CALL]) {
      expect(kind.access).toBe('owner');
      expect(kind.tier).toBe('v1');
      expect(kind.effect?.budget).toBe('effects');
    }
    expect(TOOL_CALL.outputs.map((port) => port.name)).toEqual(['result', 'ok']);
    expect(input(TOOL_CALL, 'tool')?.static).toBe(true);
  });
});

describe('http.request', () => {
  it('is owner only with a static auth port', () => {
    expect(HTTP_REQUEST.access).toBe('owner');
    expect(HTTP_REQUEST.effect?.budget).toBe('effects');
    const auth = input(HTTP_REQUEST, 'auth');
    expect(auth?.static).toBe(true);
    expect(auth?.type).toMatchObject({
      t: 'optional',
      of: { t: 'record', fields: { secret: { t: 'ref', of: 'secret' } } },
    });
    expect(HTTP_AUTH_SCHEMES).toEqual(['bearer', 'basic', 'header', 'query']);
  });

  it('refuses local network by default', () => {
    expect(input(HTTP_REQUEST, 'allowLocalNetwork')?.default).toBe(false);
    expect(input(HTTP_REQUEST, 'allowLocalNetwork')?.static).toBe(true);
  });

  it('names the headers that may not be set', () => {
    expect(HTTP_FORBIDDEN_HEADERS).toEqual([
      'authorization',
      'proxy-authorization',
      'cookie',
      'x-api-key',
    ]);
    expect(forbiddenHeaderNames(['Accept', 'Authorization', ' X-API-Key ', 'cookie'])).toEqual([
      'Authorization',
      ' X-API-Key ',
      'cookie',
    ]);
    expect(forbiddenHeaderNames(['accept'])).toEqual([]);
  });
});

describe('automation kinds', () => {
  it('calls a function with a static function port and pin', () => {
    expect(FN_CALL.class).toBe('control');
    expect(input(FN_CALL, 'fn')).toMatchObject({
      static: true,
      required: true,
      type: { t: 'ref', of: 'function' },
    });
    expect(input(FN_CALL, 'pin')?.static).toBe(true);
  });

  it('does not wait by default and guards self runs', () => {
    expect(input(AUTOMATION_RUN, 'wait')?.default).toBe(false);
    expect(input(AUTOMATION_RUN, 'allowSelf')?.default).toBe(false);
    expect(AUTOMATION_RUN.outputs.map((port) => port.name)).toEqual(['runId']);
  });

  it('stops an automation by key', () => {
    expect(AUTOMATION_STOP.class).toBe('effect');
    expect(AUTOMATION_STOP.effect).toEqual({ retry: 'idempotent', budget: 'none' });
    expect(AUTOMATION_STOP.inputs.map((port) => port.name)).toEqual(['automation', 'key']);
  });
});

describe('debug kinds', () => {
  it('logs as a counted effect', () => {
    expect(DEBUG_LOG.effect?.budget).toBe('effects');
    expect(input(DEBUG_LOG, 'level')?.default).toBe('info');
  });

  it('keeps the note inert and the breakpoint in the v1.1 tier', () => {
    expect(DEBUG_NOTE.exits).toEqual([]);
    expect(DEBUG_NOTE.outputs).toEqual([]);
    expect(DEBUG_BREAKPOINT.tier).toBe('v1.1');
    expect(DEBUG_BREAKPOINT.id).toBe('debug.breakpoint');
  });
});
