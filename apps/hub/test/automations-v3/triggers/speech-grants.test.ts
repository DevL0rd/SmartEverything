import { describe, expect, it } from 'vitest';
import type { SpeechTrigger } from '@smarteverything/domain';
import type { CommittedSpeech } from '../../../src/transcripts/speech';
import {
  armSpeech,
  authorSpeech,
  speechEntries,
  type SpeechEntry,
  type SpeechFire,
  type SpeechGrantRecord,
  type SpeechPorts,
} from '../../../src/automations/triggers-v3/speech-grants';
import { node } from './support';

interface Who {
  readonly profile: string;
}

class Fake {
  grants = new Map<string, SpeechGrantRecord<Who>>();
  record = { enabled: true, revision: 4 };
  listeners = new Set<(speech: CommittedSpeech) => void>();
  validated: (CommittedSpeech | undefined)[] = [];
  rejectSource = false;
  failures: unknown[] = [];
  admitted: SpeechTrigger[][] = [];
  principal: Who = { profile: 'ann' };

  ports: SpeechPorts<Who, Who> = {
    write: (work) => work(),
    grant: (id) => this.grants.get(id),
    saveGrant: (id, revision, principal) => {
      this.grants.set(id, { revision, principal, watermark: 10 });
    },
    removeGrant: (id) => {
      this.grants.delete(id);
    },
    automation: () => this.record,
    principalOf: (caller) => caller,
    sameInitiator: (left, right) => left.profile === right.profile,
    admitSources: (principal, triggers) => {
      this.admitted.push([...triggers]);
      return principal;
    },
    validateSource: (_principal, _source, speech) => {
      this.validated.push(speech);
      if (this.rejectSource) throw new Error('source no longer readable');
    },
    subscribe: (listener) => {
      this.listeners.add(listener);
      return (): void => {
        this.listeners.delete(listener);
      };
    },
    failed: (cause) => this.failures.push(cause),
    now: () => NOW,
  };

  say(commitId: number, text: string, bot = false): void {
    const speech: CommittedSpeech = {
      kind: 'attachment',
      commitId,
      attachmentId: 'att-1',
      chatId: null,
      profileId: 'ann',
      text,
      bot,
    };
    for (const listener of this.listeners) listener(speech);
  }
}

const NOW = new Date('2026-10-19T08:00:00.000Z');

function entriesFor(
  phrase = 'good night',
  extra: Record<string, boolean> = {},
): readonly SpeechEntry[] {
  const compiled = speechEntries([node('trigger.speech', { phrase, ...extra })]);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.value;
}

function granted(fake: Fake, revision = '4'): void {
  fake.grants.set('auto', { revision, principal: fake.principal, watermark: 10 });
}

describe('speech trigger entries', () => {
  it('parses literal ports through the speech trigger schema', () => {
    const [entry] = entriesFor('good night', { caseSensitive: true });
    expect(entry?.trigger).toMatchObject({
      phrase: 'good night',
      caseSensitive: true,
      source: null,
    });
  });

  it('reports a bad phrase or a wired port', () => {
    expect(speechEntries([node('trigger.speech', { phrase: '  ' })]).ok).toBe(false);
    const dynamic = {
      ...node('trigger.speech', {}),
      ports: { phrase: { wire: { from: 'trigger', port: 'key' } } },
    };
    expect(speechEntries([dynamic])).toMatchObject({ ok: false });
  });
});

describe('speech grants', () => {
  it('saves the grant under the saved revision and drops it when the triggers go', () => {
    const fake = new Fake();
    const triggers = entriesFor().map((entry) => entry.trigger);
    authorSpeech(fake.ports, fake.principal, {
      automationId: 'auto',
      triggers,
      save: () => ({ id: 'auto', revision: 5 }),
      saved: (row) => row,
    });
    expect(fake.grants.get('auto')?.revision).toBe('5');
    expect(fake.admitted).toHaveLength(1);
    authorSpeech(fake.ports, fake.principal, {
      automationId: 'auto',
      triggers: [],
      save: () => ({ id: 'auto', revision: 6 }),
      saved: (row) => row,
    });
    expect(fake.grants.has('auto')).toBe(false);
  });

  it('saves a plain automation without any grant work', () => {
    const fake = new Fake();
    const row = authorSpeech(fake.ports, fake.principal, {
      triggers: [],
      save: () => ({ id: 'plain', revision: 1 }),
      saved: (saved) => saved,
    });
    expect(row.id).toBe('plain');
    expect(fake.admitted).toEqual([]);
  });

  it('lets only the initiating profile change a granted automation', () => {
    const fake = new Fake();
    granted(fake);
    expect(() =>
      authorSpeech(
        fake.ports,
        { profile: 'bob' },
        {
          automationId: 'auto',
          triggers: entriesFor().map((entry) => entry.trigger),
          save: () => ({ id: 'auto', revision: 5 }),
          saved: (row) => row,
        },
      ),
    ).toThrow('Only the initiating profile');
  });
});

describe('armed speech', () => {
  it('delivers a heard phrase with its occurrence and typed payload', () => {
    const fake = new Fake();
    granted(fake);
    const delivered: SpeechFire[] = [];
    armSpeech(fake.ports, 'auto', entriesFor(), (speech) => delivered.push(speech));
    fake.say(11, 'ok, Good Night everyone');
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.occurrence).toEqual({ automationId: 'auto', revision: '4', commitId: 11 });
    expect(delivered[0]?.fire).toMatchObject({
      kind: 'trigger.speech',
      payload: {
        phrase: 'good night',
        text: 'ok, Good Night everyone',
        speaker: 'ann',
        source: { kind: 'attachment', id: 'att-1' },
      },
    });
    fake.validated.length = 0;
    delivered[0]?.validate();
    expect(fake.validated).toHaveLength(1);
  });

  it('ignores older commits, bots (unless allowed) and other phrases', () => {
    const fake = new Fake();
    granted(fake);
    const delivered: SpeechFire[] = [];
    armSpeech(fake.ports, 'auto', entriesFor(), (speech) => delivered.push(speech));
    fake.say(10, 'good night');
    fake.say(12, 'good night', true);
    fake.say(13, 'good morning');
    expect(delivered).toEqual([]);
    const withBots = new Fake();
    granted(withBots);
    armSpeech(withBots.ports, 'auto', entriesFor('good night', { includeBots: true }), (speech) =>
      delivered.push(speech),
    );
    withBots.say(12, 'good night', true);
    expect(delivered).toHaveLength(1);
  });

  it('stops when the revision, the enabled flag or the source changes', () => {
    const fake = new Fake();
    granted(fake);
    const delivered: SpeechFire[] = [];
    armSpeech(fake.ports, 'auto', entriesFor(), (speech) => delivered.push(speech));
    fake.record = { enabled: true, revision: 5 };
    fake.say(11, 'good night');
    fake.record = { enabled: false, revision: 4 };
    fake.say(12, 'good night');
    fake.record = { enabled: true, revision: 4 };
    fake.rejectSource = true;
    fake.say(13, 'good night');
    expect(delivered).toEqual([]);
    expect(fake.failures).toHaveLength(3);
  });

  it('does not subscribe without a grant or when the first validation fails', () => {
    const fake = new Fake();
    armSpeech(fake.ports, 'auto', entriesFor(), () => undefined);
    expect(fake.listeners.size).toBe(0);
    granted(fake, '3');
    armSpeech(fake.ports, 'auto', entriesFor(), () => undefined);
    expect(fake.listeners.size).toBe(0);
    expect(fake.failures).toHaveLength(1);
  });

  it('unsubscribes on cancel', () => {
    const fake = new Fake();
    granted(fake);
    const cancel = armSpeech(fake.ports, 'auto', entriesFor(), () => undefined);
    expect(fake.listeners.size).toBe(1);
    cancel();
    expect(fake.listeners.size).toBe(0);
  });
});
