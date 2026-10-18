import {
  SIGHT_CAPTURE_TIMEOUT_MS,
  SIGHT_LOOK_PICTURE_MAX,
  SIGHT_REQUEST_TIMEOUT_MS,
  type AssistantVoiceServerMessage,
  type SightSource,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubToolResult } from '../../src/ai-tools/hub-tool';
import {
  Looks,
  type LookContext,
  type OwnScreen,
  type Seen,
} from '../../src/assistant-voice/call-look';
import type { Picture } from '../../src/assistant-voice/gemini';
import { captureLogs, testLogger } from '../support/logs';

const CALL = crypto.randomUUID();
const NOW = new Date('2026-10-08T10:00:00.000Z');
const PICTURE: Picture = { data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mimeType: 'image/jpeg' };

interface Note {
  readonly text: string;
  readonly picture: Picture | undefined;
  readonly respond: boolean | undefined;
}

let looks: Looks;
let sent: AssistantVoiceServerMessage[];
let notes: Note[];
let looked: { source: SightSource; label: string }[];
let delegated: Readonly<Record<string, unknown>>[];
let allowed: Set<SightSource>;
let sharing: Set<SightSource>;
let available: Set<SightSource>;
let delegateAnswer: HubToolResult;
let own: OwnScreen;

function requestOf(type: 'sight_request' | 'sight_capture'): string {
  const message = sent.find((candidate) => candidate.type === type);
  if (message === undefined || !('requestId' in message)) {
    throw new Error(`no ${type} was sent`);
  }
  return message.requestId;
}

function seen(label = 'Phone screen'): Seen {
  return { lookId: crypto.randomUUID(), source: 'phone_screen', label, picture: PICTURE };
}

beforeEach(() => {
  vi.useFakeTimers();
  captureLogs();
  sent = [];
  notes = [];
  looked = [];
  delegated = [];
  allowed = new Set();
  sharing = new Set();
  available = new Set();
  delegateAnswer = { response: { error: 'nothing' }, line: '', pictures: [] };
  own = { source: null, computerId: null };
  looks = new Looks({
    callId: CALL,
    send: (message): void => {
      sent.push(message);
    },
    note: (text, picture, respond): void => {
      notes.push({ text, picture, respond });
    },
    delegate: (args): Promise<HubToolResult> => {
      delegated.push(args);
      return Promise.resolve(delegateAnswer);
    },
    context: (): LookContext => ({ look: allowed, available }),
    own: (): OwnScreen => own,
    shared: (source): boolean => sharing.has(source),
    looked: (source, label): void => {
      looked.push({ source, label });
    },
    now: (): Date => NOW,
    log: testLogger('voice'),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('looking at something the person has not pre-approved', () => {
  it('asks first and looks only after they accept', async () => {
    available.add('phone_screen');
    const answer = looks.see({ source: 'phone_screen', why: 'to read the error' });
    const requestId = requestOf('sight_request');
    expect(sent[0]).toMatchObject({
      type: 'sight_request',
      what: 'phone_screen',
      why: 'to read the error',
      target: null,
    });
    looks.answered(requestId, true);
    await vi.advanceTimersByTimeAsync(0);
    const captureId = requestOf('sight_capture');
    const arrived = seen('Settings');
    expect(looks.arrived(captureId, arrived)).toBe(true);
    const result = await answer;
    expect(result.response).toMatchObject({
      status: 'ok',
      source: 'phone_screen',
      what: 'Settings',
    });
    expect(result.pictures).toEqual([PICTURE]);
    expect(result.line).toBe('Looked at Settings');
    expect(looked).toEqual([{ source: 'phone_screen', label: 'Settings' }]);
    expect(sent.at(-1)).toMatchObject({ type: 'sight_looked', trigger: 'ai', label: 'Settings' });
  });

  it('tells the assistant when they say no', async () => {
    available.add('phone_screen');
    const answer = looks.see({ source: 'phone_screen' });
    looks.answered(requestOf('sight_request'), false);
    const result = await answer;
    expect(result.response['error']).toBe(
      'They did not let you look at their phone screen this time.',
    );
    expect(sent.some((message) => message.type === 'sight_capture')).toBe(false);
  });

  it('counts silence as no after the request times out', async () => {
    available.add('phone_screen');
    const answer = looks.see({ source: 'phone_screen' });
    await vi.advanceTimersByTimeAsync(SIGHT_REQUEST_TIMEOUT_MS);
    expect((await answer).response['error']).toContain('did not let you look');
  });

  it('skips the question for something they approved in advance or asked the assistant to see', async () => {
    available.add('phone_screen');
    allowed.add('phone_screen');
    const first = looks.see({ source: 'phone_screen' });
    expect(sent.some((message) => message.type === 'sight_request')).toBe(false);
    looks.arrived(requestOf('sight_capture'), seen());
    expect((await first).response['status']).toBe('ok');

    sent.length = 0;
    allowed.clear();
    const asked = looks.see({ source: 'phone_screen', asked: true });
    expect(sent.some((message) => message.type === 'sight_request')).toBe(false);
    looks.arrived(requestOf('sight_capture'), seen());
    await asked;
    expect(sent.at(-1)).toMatchObject({ type: 'sight_looked', trigger: 'asked' });
  });

  it('never asks again for a source they are already sharing', async () => {
    available.add('phone_screen');
    sharing.add('phone_screen');
    const answer = looks.see({ source: 'phone_screen', why: 'to read it', asked: false });
    expect(sent.some((message) => message.type === 'sight_request')).toBe(false);
    looks.arrived(requestOf('sight_capture'), seen());
    expect((await answer).response['status']).toBe('ok');
  });
});

describe('reaching the source', () => {
  it('says so when the app cannot show that source on this device', async () => {
    const result = await looks.see({ source: 'phone_camera' });
    expect(result.response['error']).toBe(
      'Their app cannot show you their phone camera on this device.',
    );
    expect(sent).toEqual([]);
  });

  it('refuses arguments it does not understand', async () => {
    const result = await looks.see({ source: 'nowhere' });
    expect(String(result.response['error'])).toContain('see needs why and asked');
  });

  it('asks the app for a capture with the camera facing as its target', async () => {
    available.add('phone_camera');
    allowed.add('phone_camera');
    const answer = looks.see({ source: 'phone_camera', facing: 'back' });
    expect(sent[0]).toMatchObject({
      type: 'sight_capture',
      source: 'phone_camera',
      target: 'back',
    });
    looks.arrived(requestOf('sight_capture'), seen('Back camera'));
    expect((await answer).response['what']).toBe('Back camera');
  });

  it('fails when the device sends nothing in time', async () => {
    available.add('phone_screen');
    allowed.add('phone_screen');
    const answer = looks.see({ source: 'phone_screen' });
    await vi.advanceTimersByTimeAsync(SIGHT_CAPTURE_TIMEOUT_MS);
    expect((await answer).response['error']).toBe('Nothing came back from their device in time.');
  });

  it('reports the device refusal in its own words, or the standard text', async () => {
    available.add('phone_screen');
    allowed.add('phone_screen');
    const withDetail = looks.see({ source: 'phone_screen' });
    looks.refused(requestOf('sight_capture'), 'busy', 'Another app is recording.');
    expect((await withDetail).response['error']).toBe('Another app is recording.');

    sent.length = 0;
    const standard = looks.see({ source: 'phone_screen' });
    looks.refused(requestOf('sight_capture'), 'denied', null);
    expect((await standard).response['error']).toBe('They have not allowed that on their device.');
  });

  it('fetches a home camera through the hub, passing only the arguments it needs', async () => {
    allowed.add('home_camera');
    delegateAnswer = {
      response: { what: 'Garage camera' },
      line: '',
      pictures: [PICTURE],
    };
    const result = await looks.see({ source: 'home_camera', camera: 'Garage', facing: 'front' });
    expect(delegated).toEqual([{ source: 'home_camera', camera: 'Garage' }]);
    expect(result.response).toMatchObject({ status: 'ok', what: 'Garage camera' });
    expect(sent.at(-1)).toMatchObject({ type: 'sight_looked', source: 'home_camera' });
  });

  it('passes a window title to the hub and reports why nothing could be seen', async () => {
    allowed.add('desktop_window');
    delegateAnswer = { response: { error: 'No window matches.' }, line: '', pictures: [] };
    const result = await looks.see({ source: 'desktop_window', window: 'Terminal' });
    expect(delegated).toEqual([{ source: 'desktop_window', window: 'Terminal' }]);
    expect(result.response['error']).toBe('No window matches.');
  });

  it('uses the app to capture a screen when it can, and the hub otherwise', async () => {
    available.add('desktop_screen');
    allowed.add('desktop_screen');
    const viaApp = looks.see({ source: 'desktop_screen' });
    expect(sent[0]).toMatchObject({ type: 'sight_capture' });
    looks.arrived(requestOf('sight_capture'), seen('Screen'));
    await viaApp;
    expect(delegated).toEqual([]);

    available.clear();
    delegateAnswer = { response: {}, line: '', pictures: [PICTURE] };
    await looks.see({ source: 'desktop_screen', asked: true });
    expect(delegated).toEqual([{ source: 'desktop_screen' }]);
  });
});

describe('looking with no source named', () => {
  it('looks at the phone screen of a phone call', async () => {
    own = { source: 'phone_screen', computerId: null };
    available.add('phone_screen');
    allowed.add('phone_screen');
    const answer = looks.see({ why: 'to read it', asked: true });
    expect(sent[0]).toMatchObject({ type: 'sight_capture', source: 'phone_screen' });
    looks.arrived(requestOf('sight_capture'), seen('Settings'));
    expect((await answer).response).toMatchObject({ source: 'phone_screen' });
  });

  it('looks at the computer screen of a computer call', async () => {
    own = { source: 'desktop_screen', computerId: null };
    available.add('desktop_screen');
    allowed.add('desktop_screen');
    const answer = looks.see({ why: 'to read it', asked: true });
    expect(sent[0]).toMatchObject({ type: 'sight_capture', source: 'desktop_screen' });
    looks.arrived(requestOf('sight_capture'), seen('Screen'));
    expect((await answer).response).toMatchObject({ source: 'desktop_screen' });
  });

  it('asks the hub for the calling computer when a hosted computer call has no app', async () => {
    own = { source: 'desktop_screen', computerId: 'office-pc' };
    delegateAnswer = { response: {}, line: '', pictures: [PICTURE] };
    await looks.see({ asked: true });
    expect(delegated).toEqual([{ source: 'desktop_screen', computer: 'office-pc' }]);
  });

  it('keeps a named source even when the call has a screen of its own', async () => {
    own = { source: 'phone_screen', computerId: null };
    delegateAnswer = { response: {}, line: '', pictures: [PICTURE] };
    await looks.see({ source: 'desktop_screen', asked: true });
    expect(delegated).toEqual([{ source: 'desktop_screen' }]);
  });

  it('fails when the call has no screen of its own', async () => {
    const result = await looks.see({ why: 'to see', asked: true });
    expect(result.response['error']).toBe(
      'see needs a source: this call has no screen of its own.',
    );
  });
});

describe('pictures they show', () => {
  it('hands a shown picture to the assistant without asking it to answer and tells the app', () => {
    looks.showPerson(seen('Photos'));
    expect(notes).toEqual([
      {
        text: '[They showed you Photos just now: look at this picture when you answer.]',
        picture: PICTURE,
        respond: false,
      },
    ]);
    expect(sent.at(-1)).toMatchObject({
      type: 'sight_looked',
      trigger: 'person',
      picture: PICTURE.data.toString('base64'),
      at: NOW.toISOString(),
    });
  });

  it('leaves the picture out of the message when it is too large to send back', () => {
    const big: Seen = {
      ...seen(),
      picture: { data: Buffer.alloc(SIGHT_LOOK_PICTURE_MAX), mimeType: 'image/jpeg' },
    };
    looks.shown(big, 'ai');
    expect(sent.at(-1)).toMatchObject({ type: 'sight_looked', picture: null });
  });

  it('ignores an arrival nobody is waiting for', () => {
    expect(looks.arrived(crypto.randomUUID(), seen())).toBe(false);
  });
});

describe('ending the call', () => {
  it('fails what waits for a picture and declines what waits for an answer', async () => {
    available.add('phone_screen');
    allowed.add('phone_screen');
    const capturing = looks.see({ source: 'phone_screen' });
    allowed.clear();
    const asking = looks.see({ source: 'phone_screen' });
    looks.end();
    expect((await capturing).response['error']).toBe('The call ended.');
    expect((await asking).response['error']).toContain('did not let you look');
  });
});
