import { describe, expect, it } from 'vitest';
import { frameOf, oralbFrameOf, oralbViewOf, sessionOf, viewOf } from './fixtures';
import {
  batteryWord,
  bodyHeightOf,
  liveCaption,
  liveFaceOf,
  liveKind,
  ringPxOf,
  visualPxOf,
} from './widget-model';

describe('what the live widget shows', () => {
  it('shows the brushing itself to the person it belongs to', () => {
    const frame = frameOf({ activity: 'brushing', session: 'running', elapsedS: 30 });
    expect(liveKind(viewOf(), frame)).toBe('brushing');
  });

  it('shows another person only that someone is brushing, unless the details are public', () => {
    const view = viewOf({ view: { mine: false } });
    expect(liveKind(view, frameOf({ activity: 'brushing', detailVisible: false }))).toBe('private');
    expect(liveKind(view, frameOf({ activity: 'brushing', detailVisible: true }))).toBe('brushing');
  });

  it('shows no recap of another person at rest', () => {
    expect(liveKind(viewOf({ view: { mine: false } }), frameOf())).toBe('private');
  });

  it('shows the last recap at rest and an invitation when nothing was brushed yet', () => {
    expect(liveKind(viewOf(), frameOf())).toBe('recap');
    expect(liveKind(viewOf({ view: { lastSession: null } }), frameOf())).toBe('asleep');
  });
});

describe('the caption of the live widget', () => {
  it('reads the mode and the time while brushing', () => {
    const frame = frameOf({ activity: 'brushing', elapsedS: 45 });
    expect(liveCaption(viewOf(), frame)).toBe('Clean · 0:45 of 2:00');
  });

  it('reads the last session at rest', () => {
    expect(liveCaption(viewOf({ view: { lastSession: sessionOf() } }), frameOf())).toBe(
      'Clean · 2:00',
    );
  });

  it('names whom the sessions belong to for someone else', () => {
    const view = viewOf({ view: { mine: false } });
    expect(liveCaption(view, frameOf())).toBe('Sessions belong to Sam');
    expect(liveCaption({ ...view, personName: null }, frameOf())).toBe('Sessions are private');
  });

  it('invites a first brushing when the brush never recorded one', () => {
    expect(liveCaption(viewOf({ view: { lastSession: null } }), frameOf())).toBe(
      'Brush once near your phone',
    );
  });
});

describe('the battery word', () => {
  it('rounds the percent and shows a dash when unknown', () => {
    expect(batteryWord(viewOf({ battery: { percent: 79.6 } }))).toBe('80%');
    expect(batteryWord(viewOf({ battery: { percent: null } }))).toBe('–');
  });
});

describe('sizes in a widget', () => {
  it('picks a layout from the class of the frame', () => {
    expect(liveFaceOf('m')).toBe('strip');
    expect(liveFaceOf('w')).toBe('row');
    expect(liveFaceOf('xl')).toBe('panel');
  });

  it('subtracts the header and the gap from the body', () => {
    expect(bodyHeightOf({ width: 300, height: 200, idiom: 'touch' })).toBe(148);
    expect(bodyHeightOf({ width: 300, height: 200, idiom: 'pointer' })).toBe(156);
    expect(bodyHeightOf({ width: 300, height: 20, idiom: 'touch' })).toBe(0);
  });

  it('shrinks the illustration to what fits', () => {
    expect(visualPxOf('panel', 200)).toBe(128);
    expect(visualPxOf('panel', 100)).toBe(72);
    expect(visualPxOf('panel', 40)).toBe(48);
  });

  it('keeps the timer ring between its smallest and biggest size', () => {
    expect(ringPxOf(40)).toBe(72);
    expect(ringPxOf(100)).toBe(92);
    expect(ringPxOf(500)).toBe(128);
  });
});

describe('the live widget for an Oral-B brush', () => {
  it('names the Oral-B mode and the routine in the caption', () => {
    const view = oralbViewOf();
    const frame = oralbFrameOf({ activity: 'brushing', session: 'running', elapsedS: 74 });
    expect(liveKind(view, frame)).toBe('brushing');
    expect(liveCaption(view, frame)).toBe('Daily Clean · 1:14 of 2:00');
  });

  it('shows the last Oral-B recap at rest', () => {
    expect(liveCaption(oralbViewOf(), oralbFrameOf())).toBe('Daily Clean · 2:00');
  });
});
