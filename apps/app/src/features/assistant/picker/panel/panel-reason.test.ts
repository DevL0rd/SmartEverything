import { describe, expect, it } from 'vitest';
import { NATIVE_OWNER_REASON } from '../../provider/provider-access';
import { RECONNECTING_NOTE, STOP_REASON, panelReasonOf } from './panel-reason';

describe('the reason the model panel cannot change the model', () => {
  it('tells a member the computer belongs to the owner, even while the footer also blocks them', () => {
    expect(panelReasonOf({ blocked: true, readOnly: true, ready: true })).toEqual({
      text: NATIVE_OWNER_REASON,
      icon: 'lock',
    });
  });

  it('asks the owner to stop a running reply', () => {
    expect(panelReasonOf({ blocked: true, readOnly: false, ready: true })).toEqual({
      text: STOP_REASON,
      icon: 'info',
    });
  });

  it('says it is reconnecting before the catalogue answers', () => {
    expect(panelReasonOf({ blocked: false, readOnly: false, ready: false })).toEqual({
      text: RECONNECTING_NOTE,
      icon: 'info',
    });
  });

  it('gives no reason when the model can be changed', () => {
    expect(panelReasonOf({ blocked: false, readOnly: false, ready: true })).toBeNull();
  });
});
