import {
  SIGNAL_SOURCES,
  kindSpecOf,
  signalMatchesMatcher,
  type SignalInput,
  type SignalMatcher,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { signalFire, watchedOf } from '../../../src/automations/triggers-v3/armers';
import { presenceSignal } from '../../../src/automations/world-v3/presence';
import { SignalBus } from '../../../src/signals/bus';
import { testLogger } from '../../support/logs';
import { compileCore, node, signal } from './support';

const ANNA = '20000000-0000-4000-8000-000000000001';
const BOB = '20000000-0000-4000-8000-000000000002';
const AT = '2026-10-19T08:00:00.000Z';

function arrival(id: string, name: string, home: boolean): SignalInput {
  return presenceSignal({ id, name, profile: false, home, at: AT });
}

function delivered(input: SignalInput): readonly SignalInput[] {
  const bus = new SignalBus({ log: testLogger() });
  const heard: SignalInput[] = [];
  bus.subscribe((heardSignal) => {
    heard.push(heardSignal);
  });
  bus.emit(input);
  return heard;
}

function heardOnce(input: SignalInput): SignalInput {
  const [only] = delivered(input);
  if (only === undefined) throw new Error('The presence signal was not delivered');
  return only;
}

function firstMatcher(compiled: ReturnType<typeof compileCore>): SignalMatcher {
  const [entry] = watchedOf(compiled, () => true).triggers;
  if (entry === undefined) throw new Error('No trigger compiled');
  return entry.matcher;
}

describe('the core presence signal', () => {
  it('is a registered source with arrival and departure kinds', () => {
    expect(
      kindSpecOf(SIGNAL_SOURCES, { source: 'presence', kind: 'person_arrived' }),
    ).toBeDefined();
    expect(kindSpecOf(SIGNAL_SOURCES, { source: 'presence', kind: 'person_left' })).toBeDefined();
  });

  it('reaches the bus without being dropped as unregistered', () => {
    expect(delivered(arrival(ANNA, 'Anna', true))).toHaveLength(1);
  });

  it('carries the person, the home place and the moment', () => {
    expect(arrival(ANNA, 'Anna', true)).toMatchObject({
      source: 'presence',
      kind: 'person_arrived',
      subject: 'Anna',
      at: AT,
      data: { person_id: ANNA, name: 'Anna', profile_id: null, place: 'home' },
    });
    expect(arrival(ANNA, 'Anna', false).kind).toBe('person_left');
  });

  it('names the profile of an account holder', () => {
    const move = presenceSignal({ id: ANNA, name: 'Anna', profile: true, home: true, at: AT });
    expect(move.data['profile_id']).toBe(ANNA);
  });
});

describe('a stored presence automation', () => {
  it('fires on arrival with the person, place and event', () => {
    const trigger = node('trigger.presence', {});
    const compiled = compileCore('auto', [trigger]);
    expect(compiled.problems).toEqual([]);
    const heard = heardOnce(arrival(ANNA, 'Anna', true));
    expect(signalMatchesMatcher(firstMatcher(compiled), heard)).toBe(true);
    expect(signalFire(compiled, heard, trigger.id)?.payload).toMatchObject({
      person: ANNA,
      place: 'home',
      event: 'arrived',
    });
  });

  it('fires on departure only when the event is left', () => {
    const left = compileCore('auto', [node('trigger.presence', { event: 'left' })]);
    const arrived = compileCore('auto', [node('trigger.presence', {})]);
    const heard = heardOnce(arrival(ANNA, 'Anna', false));
    expect(signalMatchesMatcher(firstMatcher(left), heard)).toBe(true);
    expect(signalMatchesMatcher(firstMatcher(arrived), heard)).toBe(false);
  });

  it('narrows to one person', () => {
    const matcher = firstMatcher(compileCore('auto', [node('trigger.presence', { person: BOB })]));
    expect(signalMatchesMatcher(matcher, heardOnce(arrival(ANNA, 'Anna', true)))).toBe(false);
    expect(signalMatchesMatcher(matcher, heardOnce(arrival(BOB, 'Bob', true)))).toBe(true);
  });

  it('no longer listens to the router own event', () => {
    const matcher = firstMatcher(compileCore('auto', [node('trigger.presence', {})]));
    const routerEvent = signal({
      source: 'plugin_router',
      kind: 'person_arrived',
      subject: 'Anna',
      field: null,
      data: { person_id: ANNA },
    });
    expect(signalMatchesMatcher(matcher, routerEvent)).toBe(false);
  });
});
