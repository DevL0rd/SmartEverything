import { describe, expect, it } from 'vitest';
import { oralbViewOf, viewOf } from './fixtures';
import { noticesOf } from './notices';

const NOW = Date.parse('2026-10-18T07:30:00.000Z');

function keys(...args: Parameters<typeof viewOf>): readonly string[] {
  return noticesOf(viewOf(...args), NOW).map((notice) => notice.key);
}

describe('notices on the toothbrush page', () => {
  it('shows nothing for a healthy brush', () => {
    expect(keys()).toEqual([]);
  });

  it('explains a brush held by another app, a lost pairing and a switched off Bluetooth', () => {
    expect(keys({ link: { phase: 'busy' } })).toEqual(['busy']);
    expect(noticesOf(viewOf({ link: { phase: 'needs_pairing' } }), NOW)[0]).toMatchObject({
      key: 'pairing',
      action: 'settings',
    });
    expect(keys({ link: { phase: 'bluetooth_off' } })).toEqual(['bluetooth']);
  });

  it('stays quiet while the brush simply sleeps', () => {
    expect(keys({ link: { phase: 'asleep' } })).toEqual([]);
  });

  it('asks for the model when it is not recognised and offers the model pick', () => {
    const notice = noticesOf(viewOf({ view: { family: 'unknown' } }), NOW)[0];
    expect(notice).toMatchObject({ key: 'model', action: 'model' });
  });

  it('warns about a low battery that is not charging', () => {
    expect(keys({ battery: { low: true, percent: 12 } })).toEqual(['battery']);
    expect(keys({ battery: { low: true, percent: 12, charging: true } })).toEqual([]);
  });

  it('warns about a worn out head and about a head that is not recognised', () => {
    expect(keys({ head: { wearPercent: 100 } })).toEqual(['head']);
    expect(keys({ head: { wearPercent: 90 } })).toEqual([]);
    expect(keys({ head: { state: 'unrecognised', wearPercent: null } })).toEqual(['head']);
  });

  it('shows a fault as critical, first among the rest', () => {
    const view = viewOf({ battery: { low: true, percent: 10 } });
    const faulty = { ...view, handle: { ...view.handle, faultHex: '4:0' } };
    const found = noticesOf(faulty, NOW);
    expect(found.map((notice) => notice.key)).toEqual(['fault', 'battery']);
    expect(found[0]?.tone).toBe('critical');
  });
});

describe('notices for an Oral-B brush', () => {
  it('shows nothing for a healthy brush', () => {
    expect(noticesOf(oralbViewOf(), NOW)).toEqual([]);
  });

  it('names the Oral-B app when another app holds the brush', () => {
    const [notice] = noticesOf(oralbViewOf({ link: { phase: 'busy' } }), NOW);
    expect(notice?.key).toBe('busy');
    expect(notice?.body).toContain('Close the Oral-B app');
  });

  it('leaves the head countdown to the head card', () => {
    expect(noticesOf(oralbViewOf({ head: { daysLeft: 0 } }), NOW).map((n) => n.key)).toEqual([]);
  });
});
