import { afterEach, describe, expect, it } from 'vitest';
import type { WeighedReading } from '../../store/people';
import { readingOf } from '../../store/body-fixture';
import { askWhoWeighed, askedWeighIn, settleWeighIn, weighInToAsk } from './weigh-in-request';

function pending(id: string): WeighedReading {
  return readingOf({ id, attribution: 'pending', profile_id: null, weight_kg: 90.1 });
}

const FIRST = pending('00000000-0000-4000-8000-00000000000a');
const SECOND = pending('00000000-0000-4000-8000-00000000000b');

afterEach(() => {
  settleWeighIn(askedWeighIn() ?? '');
});

describe('which weigh-in the who-was-this sheet asks about', () => {
  it('asks about the first waiting weigh-in the person has not closed', () => {
    expect(weighInToAsk([FIRST, SECOND], null, [])).toBe(FIRST);
    expect(weighInToAsk([FIRST, SECOND], null, [FIRST.id])).toBe(SECOND);
    expect(weighInToAsk([FIRST, SECOND], null, [FIRST.id, SECOND.id])).toBeUndefined();
  });

  it('opens the weigh-in a tapped notification named even after its sheet was closed', () => {
    askWhoWeighed(SECOND.id);
    expect(weighInToAsk([FIRST, SECOND], askedWeighIn(), [FIRST.id, SECOND.id])).toBe(SECOND);
  });

  it('waits for the tapped weigh-in to arrive after a cold start', () => {
    askWhoWeighed(SECOND.id);
    expect(weighInToAsk([], askedWeighIn(), [])).toBeUndefined();
    expect(weighInToAsk([FIRST, SECOND], askedWeighIn(), [])).toBe(SECOND);
  });

  it('forgets the tapped weigh-in once its sheet closes and keeps any newer tap', () => {
    askWhoWeighed(FIRST.id);
    settleWeighIn(FIRST.id);
    expect(askedWeighIn()).toBeNull();
    askWhoWeighed(SECOND.id);
    settleWeighIn(FIRST.id);
    expect(askedWeighIn()).toBe(SECOND.id);
  });

  it('asks about nothing once the tapped weigh-in was answered elsewhere', () => {
    askWhoWeighed(SECOND.id);
    expect(weighInToAsk([FIRST], askedWeighIn(), [FIRST.id])).toBeUndefined();
  });
});
