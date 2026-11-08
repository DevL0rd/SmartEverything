import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import {
  cacheBand,
  cacheLabel,
  cachePercent,
  costText,
  compactShown,
  helperRuns,
  executionFolderPath,
  executionLineOf,
  footerFacts,
} from './chat-footer';

const FILE: AssistantMessageRow['attachments'][number] = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'photo.png',
  mime: 'image/png',
  bytes: 1200,
  width: null,
  height: null,
};

type CostedChat = Parameters<typeof helperRuns>[0][number];
type Row = Pick<AssistantMessageRow, 'role' | 'attachments'>;

const person: Row = { role: 'person', attachments: [FILE, FILE] };
const reply: Row = { role: 'responder', attachments: [] };
const replyWithFile: Row = { role: 'responder', attachments: [FILE] };

describe('footerFacts', () => {
  it('is hidden for a chat with no cost and no context, even with replies', () => {
    expect(footerFacts({ cost_micros: 0, context_percent: null }, [person, reply])).toBeNull();
  });

  it('shows the chat total and counts replies and files', () => {
    expect(
      footerFacts({ cost_micros: 120_000, context_percent: 42 }, [person, reply, replyWithFile]),
    ).toEqual({ costMicros: 120_000, costIncomplete: false, context: 42, replies: 2, files: 3 });
  });

  it('shows with only a context reading, even at zero', () => {
    expect(footerFacts({ cost_micros: 0, context_percent: 0 }, [])).toEqual({
      costMicros: 0,
      costIncomplete: false,
      context: 0,
      replies: 0,
      files: 0,
    });
  });

  it('shows with only a cost', () => {
    expect(footerFacts({ cost_micros: 5, context_percent: null }, [reply])?.replies).toBe(1);
  });
});

describe('compactShown', () => {
  it('offers compaction from 60 % of the context', () => {
    expect(compactShown(null)).toBe(false);
    expect(compactShown(59)).toBe(false);
    expect(compactShown(60)).toBe(true);
  });
});

describe('executionLineOf', () => {
  const home = {
    runtime: null,
    host: 'Home Hub',
    path: null,
    offline: false,
    switchingTo: null,
  } as const;

  it('names the machine and the last folder segment', () => {
    expect(executionLineOf({ ...home, host: 'Workstation', path: '/home/dana/repo' }).text).toBe(
      'Workstation · repo',
    );
  });

  it('names the runtime when a computer runs Claude or Codex', () => {
    expect(
      executionLineOf({ ...home, runtime: 'Claude', host: 'Workstation', path: 'C:\\work\\app\\' })
        .text,
    ).toBe('Claude on Workstation · app');
  });

  it('shows only the machine when the folder is unknown or home', () => {
    expect(executionLineOf(home).text).toBe('Home Hub');
    expect(executionLineOf({ ...home, path: '~' }).text).toBe('Home Hub');
  });

  it('warns when the machine is offline', () => {
    expect(executionLineOf({ ...home, host: 'Studio', offline: true })).toEqual({
      text: 'Studio is offline',
      warning: true,
      cancel: null,
    });
  });

  it('says where the chat is moving to, ahead of everything else', () => {
    expect(executionLineOf({ ...home, offline: true, switchingTo: 'Studio' })).toEqual({
      text: 'Switching to Studio after the current step…',
      warning: false,
      cancel: null,
    });
  });
});

describe('executionFolderPath', () => {
  const chatFolder = '/data/assistant/projects/3f2b8c1e-5d4a-4b7e-9c10-a1b2c3d4e5f6';

  it('hides the private per-chat folder of the home hub', () => {
    expect(executionFolderPath({ kind: 'server' }, chatFolder)).toBeNull();
  });

  it('keeps the folder of a computer', () => {
    expect(
      executionFolderPath({ kind: 'device', device_id: 'computer:abc' }, '/home/dana/repo'),
    ).toBe('/home/dana/repo');
  });
});

describe('helper cost in the footer', () => {
  const chat = (
    id: string,
    parent: string | null,
    cost: number,
    incomplete = false,
  ): CostedChat => ({
    id,
    parent_id: parent,
    kind: parent === null ? ('chat' as const) : ('subagent' as const),
    cost_micros: cost,
    cost_incomplete: incomplete,
  });
  const root = chat('root', null, 100);
  const chats = [
    root,
    chat('a', 'root', 10),
    chat('b', 'a', 5, true),
    chat('other', null, 999),
    chat('c', 'other', 7),
  ];

  it('adds every nested helper run once and flags unknown helper cost', () => {
    const helpers = helperRuns(chats, 'root');
    expect(helpers.map((helper) => helper.id).sort()).toEqual(['a', 'b']);
    expect(footerFacts({ ...root, context_percent: null }, [], helpers)).toMatchObject({
      costMicros: 115,
      costIncomplete: true,
    });
  });
});

describe('cachePercent', () => {
  it('reads the rolling share the hub computed', () => {
    expect(cachePercent({ cache_percent: 87 })).toBe(87);
    expect(cachePercent({ cache_percent: 0 })).toBe(0);
  });

  it('shows nothing when the hub has no measurement', () => {
    expect(cachePercent({ cache_percent: null })).toBeNull();
  });
});

describe('cacheBand', () => {
  it('splits the cache share into the four readable bands', () => {
    expect(cacheBand(null)).toBe('none');
    expect(cacheBand(0)).toBe('none');
    expect(cacheBand(1)).toBe('low');
    expect(cacheBand(24)).toBe('low');
    expect(cacheBand(25)).toBe('part');
    expect(cacheBand(59)).toBe('part');
    expect(cacheBand(60)).toBe('most');
    expect(cacheBand(94)).toBe('most');
    expect(cacheBand(95)).toBe('all');
    expect(cacheBand(100)).toBe('all');
  });
});

describe('cacheLabel', () => {
  it('distinguishes a known zero from a provider that reports no cache data', () => {
    expect(cacheLabel(null)).toBeNull();
    expect(cacheLabel(0)).not.toBeNull();
    expect(cacheLabel(0)).toContain('0%');
    expect(cacheLabel(70)).toContain('70%');
  });
});

describe('costText', () => {
  const money = { cost: (micros: number): string => `$${(micros / 1_000_000).toFixed(2)}` };
  const of = (micros: number, incomplete: boolean, working: boolean): string | null =>
    costText({ money, micros, incomplete, working });

  it('shows nothing before any cost is known', () => {
    expect(of(0, false, false)).toBeNull();
  });

  it('never claims an unknown cost while a turn is still running', () => {
    expect(of(1_500_000, true, true)).toBe('$1.50');
    expect(of(1_500_000, false, true)).toBe('$1.50');
  });

  it('admits an unknown cost once the turn has stopped and it is still missing', () => {
    expect(of(1_500_000, true, false)).toBe('$1.50 + unknown');
    expect(of(1_500_000, false, false)).toBe('$1.50');
  });
});
