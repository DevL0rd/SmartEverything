import { describe, expect, it, vi } from 'vitest';

vi.mock('../call/settings-sheet/live-strip', () => ({ CallAudioPageStrip: (): null => null }));
vi.mock('../call/settings-sheet/detection-row', () => ({ DetectionRow: (): null => null }));
vi.mock('../call/settings-sheet/echo-rows', () => ({ EchoChoiceRows: (): null => null }));
vi.mock('../call/settings-sheet/echo-test-row', () => ({ EchoTestRow: (): null => null }));
vi.mock('../call/settings-sheet/device-row-set', () => ({
  DEVICE_ROWS: [
    { id: 'call.microphone', title: 'Microphone', keywords: [], component: (): null => null },
  ],
}));
vi.mock('../call/settings-sheet/video-row-set', () => ({
  VIDEO_ROWS: [
    { id: 'call.video-mode', title: 'Video mode', keywords: [], component: (): null => null },
  ],
}));

const { CALL_AUDIO_SECTIONS, CALL_AUDIO_SETTINGS, CALL_PANEL_SECTIONS } =
  await import('./call-audio-settings');

const sectionOrder = CALL_AUDIO_SETTINGS.reduce<string[]>(
  (order, setting) =>
    setting.section === undefined || order.includes(setting.section)
      ? order
      : [...order, setting.section],
  [],
);

describe('the call audio and video settings', () => {
  it('shows the in-call panel sections in the page order, then Start a call with', () => {
    expect(sectionOrder).toEqual([...CALL_PANEL_SECTIONS, CALL_AUDIO_SECTIONS.start]);
  });

  it('opens the page with the microphone level strip', () => {
    expect(CALL_AUDIO_SETTINGS[0]?.id).toBe('call.level-strip');
    expect(CALL_AUDIO_SETTINGS[0]?.section).toBeUndefined();
  });

  it('closes the page with Reset to defaults', () => {
    const last = CALL_AUDIO_SETTINGS.at(-1);
    expect(last?.id).toBe('call.reset');
    expect(last?.control).toBe('action');
  });
});
