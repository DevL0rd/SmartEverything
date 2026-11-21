import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { NOTICES, pausedProbes } from '../../../test-support/paused-probe';
import { toggleVoiceTranscript, useVoiceTranscriptOpen } from './voice-pill-transcript-state';

const { mount, pausedScreen, resume } = pausedProbes();

describe('the voice transcript on a paused screen', () => {
  it('holds voice transcript toggles while paused and shows the final state on resume', () => {
    const pause = pausedScreen();
    const probe = mount(pause, () => useVoiceTranscriptOpen('paused-clip'));
    const mounted = probe.renders();
    for (let notice = 0; notice < NOTICES + 1; notice += 1) {
      act(() => {
        toggleVoiceTranscript('paused-clip');
      });
    }
    expect(probe.renders()).toBe(mounted);
    resume(pause);
    expect(probe.renders()).toBe(mounted + 1);
    expect(probe.value()).toBe(true);
  });
});
