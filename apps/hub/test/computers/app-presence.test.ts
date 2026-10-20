import {
  DEFAULT_COMPUTER_SCOPES,
  type AppEvent,
  type DeviceEvent,
  type SignalInput,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { computerExternalId } from '../../src/computers/computer-device';
import { HELLO, sessionRig, type SessionRigOptions } from '../support/session-rig';

const FIREFOX = { id: 'firefox.desktop', name: 'Firefox' };
const KATE = { id: 'org.kde.kate', name: 'Kate' };
const AT = '2026-10-08T10:00:00.000Z';

function app(kind: AppEvent['kind'], who: AppEvent['app'], title: string | null = null): AppEvent {
  return { kind, app: who, title };
}

interface Recorded {
  readonly events: DeviceEvent[];
  readonly signals: SignalInput[];
  readonly send: (events: readonly AppEvent[], baseline?: boolean) => void;
  readonly rig: ReturnType<typeof sessionRig>;
}

function started(options: SessionRigOptions = {}, person = true): Recorded {
  const events: DeviceEvent[] = [];
  const signals: SignalInput[] = [];
  const rig = sessionRig('device-1', {
    ...(person ? { personId: 'person-1' } : {}),
    ...options,
    event: (event) => events.push(event),
    signal: (signal) => signals.push(signal),
  });
  return {
    events,
    signals,
    rig,
    send: (batch, baseline = false): void => {
      rig.deliver({ type: 'app_events', at: AT, baseline, events: batch });
    },
  };
}

function states(signals: readonly SignalInput[]): string[] {
  return signals.map(
    (signal) => `${signal.kind}:${signal.field ?? ''}=${JSON.stringify(signal.value)}`,
  );
}

beforeEach(() => {
  captureLogs();
});

describe('app presence on the hub', () => {
  it('records an app event with the app, window title, computer, user and person', () => {
    const { events, send, rig } = started();
    rig.deliver({
      type: 'state',
      at: AT,
      parts: {
        session: {
          at: AT,
          user: 'ada',
          locked: false,
          focused: null,
          volume: null,
          muted: null,
          media: null,
        },
      },
    });
    send([app('opened', FIREFOX, 'Home')]);
    expect(events).toEqual([
      {
        externalId: computerExternalId(HELLO.machineId),
        kind: 'app_opened',
        occurredAt: AT,
        details: {
          summary: 'Firefox opened',
          topic: 'Firefox',
          app: 'Firefox',
          appId: 'firefox.desktop',
          title: 'Home',
          user: 'ada',
          personId: 'person-1',
        },
      },
    ]);
  });

  it('maps every kind to its event and its on or off state signal', () => {
    const { events, signals, send } = started();
    send([
      app('opened', FIREFOX),
      app('focused', FIREFOX),
      app('unfocused', FIREFOX),
      app('closed', FIREFOX),
    ]);
    expect(events.map((event) => event.kind)).toEqual([
      'app_opened',
      'app_focused',
      'app_unfocused',
      'app_closed',
    ]);
    expect(states(signals)).toEqual([
      'app_open:firefox.desktop=true',
      'app_focus:firefox.desktop=true',
      'app_focus:firefox.desktop=false',
      'app_open:firefox.desktop=false',
    ]);
    expect(signals[0]).toMatchObject({
      source: 'computer',
      subject: 'device-1',
      profileId: 'person-1',
      data: { app: 'Firefox', appId: 'firefox.desktop' },
    });
  });

  it('turns a baseline into state only, with no activity events', () => {
    const { events, signals, send } = started();
    send([app('opened', FIREFOX), app('opened', KATE), app('focused', KATE)], true);
    expect(events).toEqual([]);
    expect(states(signals)).toEqual([
      'app_open:firefox.desktop=true',
      'app_open:org.kde.kate=true',
      'app_focus:org.kde.kate=true',
    ]);
  });

  it('closes what a new baseline no longer lists and moves the front', () => {
    const { signals, send } = started();
    send([app('opened', FIREFOX), app('opened', KATE), app('focused', KATE)], true);
    signals.length = 0;
    send([app('opened', FIREFOX), app('focused', FIREFOX)], true);
    expect(states(signals)).toEqual([
      'app_focus:org.kde.kate=false',
      'app_open:org.kde.kate=false',
      'app_open:firefox.desktop=true',
      'app_focus:firefox.desktop=true',
    ]);
  });

  it('drops events while the app events permission is off', () => {
    const { events, signals, send } = started({
      scopes: { ...DEFAULT_COMPUTER_SCOPES, app_events: false },
    });
    send([app('opened', FIREFOX)]);
    expect(events).toEqual([]);
    expect(signals).toEqual([]);
  });

  it('drops events while the apps permission is off', () => {
    const { events, send } = started({ scopes: { ...DEFAULT_COMPUTER_SCOPES, apps: false } });
    send([app('opened', FIREFOX)]);
    expect(events).toEqual([]);
  });

  it('marks open apps closed and nothing in front when the session ends', () => {
    const { signals, send, rig } = started();
    send([app('opened', FIREFOX), app('focused', FIREFOX), app('opened', KATE)]);
    signals.length = 0;
    rig.session.stop();
    expect(states(signals)).toEqual([
      'app_focus:firefox.desktop=false',
      'app_open:firefox.desktop=false',
      'app_open:org.kde.kate=false',
    ]);
  });

  it('keeps state signals flowing but sheds activity events in a flood, then resumes', () => {
    let now = new Date(AT).getTime();
    const { events, signals, send } = started({ now: () => new Date(now) });
    const flood = Array.from({ length: 60 }, (_, index) =>
      app(index % 2 === 0 ? 'opened' : 'closed', FIREFOX),
    );
    send(flood);
    expect(events).toHaveLength(40);
    expect(signals).toHaveLength(60);
    now += 5000;
    send([app('opened', KATE)]);
    expect(events).toHaveLength(41);
  });

  it('omits the title, user and person when they are not known', () => {
    const { events, send } = started({}, false);
    send([app('opened', FIREFOX)]);
    expect(events[0]?.details).toEqual({
      summary: 'Firefox opened',
      topic: 'Firefox',
      app: 'Firefox',
      appId: 'firefox.desktop',
    });
  });
});
