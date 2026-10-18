import { describe, expect, it } from 'vitest';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { compactShown, executionFolderPath, executionLineOf, footerFacts } from './chat-footer';

const FILE: AssistantMessageRow['attachments'][number] = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'photo.png',
  mime: 'image/png',
  bytes: 1200,
  width: null,
  height: null,
};

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
    ).toEqual({ costMicros: 120_000, context: 42, replies: 2, files: 3 });
  });

  it('shows with only a context reading, even at zero', () => {
    expect(footerFacts({ cost_micros: 0, context_percent: 0 }, [])).toEqual({
      costMicros: 0,
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
