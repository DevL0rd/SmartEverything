import { describe, expect, it } from 'vitest';
import { LOG_ROOM_START, logRoomAfter, type LogMeasure, type LogRoom } from './wide-log';

function after(...measures: readonly LogMeasure[]): LogRoom {
  return measures.reduce(logRoomAfter, LOG_ROOM_START);
}

const need = (px: number): LogMeasure => ({ kind: 'need', px });
const got = (px: number): LogMeasure => ({ kind: 'got', px });
const slack = (px: number): LogMeasure => ({ kind: 'slack', px });

describe('fitting the wide card log by measured room', () => {
  it('mounts nothing until the card has measured free room', () => {
    expect(after().stage).toBe('off');
    expect(after(need(40), got(40)).stage).toBe('off');
    expect(after(slack(0)).stage).toBe('off');
  });

  it('measures the log once there is free room', () => {
    expect(after(slack(30)).stage).toBe('probe');
  });

  it('shows the log when the free room holds it', () => {
    expect(after(slack(40), need(40)).stage).toBe('on');
    expect(after(slack(90), need(40), got(40)).stage).toBe('on');
  });

  it('leaves the log out when it is taller than the free room', () => {
    expect(after(slack(24), need(40)).stage).toBe('off');
  });

  it('takes a shown log out when its slot is squeezed below it', () => {
    expect(after(slack(60), need(40), got(30)).stage).toBe('off');
  });

  it('takes a shown log out when its content grows past its slot', () => {
    expect(after(slack(60), need(40), got(40), need(64)).stage).toBe('off');
    expect(after(slack(90), need(40), got(64), need(64)).stage).toBe('on');
  });

  it('measures again when the free room changes after it was left out', () => {
    const out = after(slack(24), need(40));
    expect(logRoomAfter(out, slack(48)).stage).toBe('probe');
    expect(after(slack(24), need(40), slack(48), need(40)).stage).toBe('on');
  });

  it('ignores room measured while the log is shown', () => {
    const shown = after(slack(60), need(40), got(40));
    expect(logRoomAfter(shown, slack(20))).toBe(shown);
    expect(logRoomAfter(shown, got(40))).toBe(shown);
  });
});
