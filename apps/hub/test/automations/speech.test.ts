import { TEST_AUTHOR } from '../support/automation-author';
import {
  AUTOMATION_V2,
  DEFAULT_ENGINE,
  type SignalInput,
  type SpeechTrigger,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authorSpeechAutomation } from '../../src/automations/speech-authoring';
import { speechTriggerArmer } from '../../src/automations/speech-trigger';
import type { TriggerAdmission } from '../../src/automations/trigger-armers';
import type { Caller } from '../../src/server/auth';
import type { Store } from '../../src/store/store';
import { speechPhraseMatches } from '../../src/transcripts/speech-phrase';
import { legacyAutomation } from '../support/legacy-automation';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

const PHRASE = (
  phrase: string,
  extra: Partial<Omit<SpeechTrigger, 'type'>> = {},
): Omit<SpeechTrigger, 'type'> => ({
  phrase,
  caseSensitive: false,
  includeBots: false,
  source: null,
  ...extra,
});

describe('C9 literal speech phrases', () => {
  it('matches a word or a contiguous phrase inside what was said, ignoring punctuation and case', () => {
    const said = 'Okay, please turn ON the lights now!';
    expect(speechPhraseMatches(PHRASE('turn on the lights'), said)).toBe(true);
    expect(speechPhraseMatches(PHRASE('lights'), said)).toBe(true);
    expect(speechPhraseMatches(PHRASE('turn lights'), said)).toBe(false);
    expect(speechPhraseMatches(PHRASE('light'), said)).toBe(false);
  });

  it('matches case exactly when asked to', () => {
    expect(
      speechPhraseMatches(PHRASE('Lights', { caseSensitive: true }), 'turn on the lights'),
    ).toBe(false);
    expect(speechPhraseMatches(PHRASE('Lights', { caseSensitive: true }), 'Lights on')).toBe(true);
  });
});

interface Bench {
  readonly store: Store;
  readonly automationId: string;
  readonly fired: { readonly signal: SignalInput | null; readonly admission?: TriggerAdmission }[];
  readonly say: (text: string, bot?: boolean) => void;
}

function bench(store: Store, trigger: Omit<SpeechTrigger, 'type'>): Bench {
  const profile = store.profiles.first();
  const client = store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  const chat = store.aiChats.create({
    profileId: profile.id,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  });
  const attachmentId = '5a000000-0000-4000-8000-000000000001';
  store.assistantChat.addAttachment({
    id: attachmentId,
    profile_id: profile.id,
    name: 'note.m4a',
    mime: 'audio/mp4',
    bytes: 10,
    width: null,
    height: null,
    storage_path: 'note.m4a',
    sha256: 'b'.repeat(64),
  });
  const caller: Caller = { kind: 'client', client };
  const definition = legacyAutomation({
    triggers: [{ ...trigger, type: 'speech', source: { kind: 'attachment', chatId: chat.id } }],
    conditions: { mode: 'all', items: [] },
    actions: [{ type: 'notify', message: 'heard' }],
  });
  const row = authorSpeechAutomation(store, caller, {
    definition,
    save: () =>
      store.automations.create({
        name: 'Listens',
        enabled: true,
        definition,
        origin: null,
        author: TEST_AUTHOR,
      }),
  });
  const fired: Bench['fired'] = [];
  const armed = AUTOMATION_V2.parse(row.definition).when[0];
  if (armed === undefined) throw new Error('The speech trigger was not saved.');
  speechTriggerArmer(store).arm(row.id, armed, (signal, admission) => {
    fired.push({ signal, ...(admission === undefined ? {} : { admission }) });
  });
  return {
    store,
    automationId: row.id,
    fired,
    say: (text, bot = false): void => {
      store.feed.speech({
        kind: 'attachment',
        commitId: store.speech.nextCommit(),
        attachmentId,
        chatId: chat.id,
        profileId: profile.id,
        text,
        bot,
      });
    },
  };
}

describe('C9 saved speech triggers', () => {
  it('fires for finalized speech that contains the phrase and carries a dedup occurrence', () => {
    const { fired, say, automationId } = bench(opened.store, PHRASE('lights on'));
    say('please put the lights on');
    say('something else entirely');
    expect(fired).toHaveLength(1);
    expect(fired[0]?.admission?.occurrence).toMatchObject({ automationId });
  });

  it('ignores bot speech unless the trigger includes bots', () => {
    const quiet = bench(opened.store, PHRASE('lights on'));
    quiet.say('lights on', true);
    expect(quiet.fired).toHaveLength(0);
  });

  it('claims each committed speech once so a replay is not admitted twice', () => {
    const { fired, say, store } = bench(opened.store, PHRASE('lights on'));
    say('lights on');
    const occurrence = fired[0]?.admission?.occurrence;
    if (occurrence === undefined) throw new Error('The speech did not fire.');
    const run = (): void => {
      store.automationRuns.create({
        occurrence,
        automationId: occurrence.automationId,
        revision: 1,
        ownerProfileId: null,
      });
    };
    run();
    expect(run).toThrow('already admitted');
  });

  it('stops listening when its saved authorization is revoked', () => {
    const { fired, say, store, automationId } = bench(opened.store, PHRASE('lights on'));
    store.speech.remove(automationId);
    say('lights on');
    expect(fired).toHaveLength(0);
  });

  it('stops listening when the automation is changed without reauthorizing it', () => {
    const { fired, say, store, automationId } = bench(opened.store, PHRASE('lights on'));
    say('lights on');
    expect(fired).toHaveLength(1);
    const current = store.automations.byId(automationId);
    store.automations.update(automationId, {
      definition: AUTOMATION_V2.parse({
        ...current.definition,
        steps: [{ do: 'notify', message: 'changed' }],
      }),
    });
    say('lights on');
    expect(fired).toHaveLength(1);
  });

  it('stops listening after a rename that was not reauthorized, because a rename moves the revision', () => {
    const { fired, say, store, automationId } = bench(opened.store, PHRASE('lights on'));
    store.automations.update(automationId, { name: 'Renamed' });
    say('lights on');
    expect(fired).toHaveLength(0);
  });

  it('also fires for bot speech when the trigger includes bots', () => {
    const open = bench(opened.store, PHRASE('lights on', { includeBots: true }));
    open.say('lights on', true);
    expect(open.fired).toHaveLength(1);
  });
});
