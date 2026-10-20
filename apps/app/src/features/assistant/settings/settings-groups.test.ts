import { describe, expect, it, vi } from 'vitest';

vi.mock('../reach/reach-settings', () => ({ REACH_SETTINGS: [] }));
vi.mock('./call-voice-setting-row', () => ({
  CallVoiceSettingRow: (): null => null,
  SpokenLineVoiceSettingRow: (): null => null,
}));
vi.mock('./gemini-key', () => ({ GeminiKeySection: (): null => null }));
vi.mock('./clear-history-row', () => ({ ClearHistoryRow: (): null => null }));
vi.mock('./quick-ask-shortcut-row', () => ({ QuickAskShortcutRow: (): null => null }));
vi.mock('../call/settings-sheet/live-strip', () => ({ CallAudioPageStrip: (): null => null }));
vi.mock('../call/settings-sheet/detection-row', () => ({ DetectionRow: (): null => null }));
vi.mock('../call/settings-sheet/echo-rows', () => ({ EchoChoiceRows: (): null => null }));
vi.mock('../call/settings-sheet/echo-test-row', () => ({ EchoTestRow: (): null => null }));
vi.mock('../call/settings-sheet/device-row-set', () => ({ DEVICE_ROWS: [] }));
vi.mock('../call/settings-sheet/video-row-set', () => ({ VIDEO_ROWS: [] }));

const { SETTINGS } = await import('../settings');
const { OVERLAY_SETTINGS } = await import('../overlay/overlay-settings');
const { ASSISTANT_PAGES } = await import('../../../settings/tree-assistant');

const rootRows = SETTINGS.filter(
  (setting) => setting.page === 'assistant' && setting.control !== 'listed',
);

const BEFORE_REGROUPING = [
  'assistant.name',
  'assistant.openrouter',
  'assistant.openrouter.key',
  'assistant.openrouter.paste',
  'assistant.openrouter.remove',
  'assistant.openrouter.credit',
  'assistant.openrouter.limit',
  'assistant.openrouter.default',
  'assistant.openrouter.spent-today',
  'assistant.openrouter.spent-week',
  'assistant.openrouter.spent-month',
  'assistant.voice.speech-model',
  'assistant.voice.speech-voice',
  'assistant.style.availability',
  'assistant.style.personality',
  'assistant.style.verbosity',
  'assistant.style.format',
  'assistant.style.custom',
  'assistant.style.reset',
  'assistant.steps',
  'assistant.reply-cost',
  'assistant.reply-suggestions',
  'assistant.compact',
  'assistant.reuse-chat',
  'assistant.instructions',
  'assistant.voice.call-voice',
  'assistant.voice.idle',
  'assistant.voice.context',
  'assistant.voice.live-video',
  'assistant.voice.mute-mic',
  'assistant.clear',
  'assistant.quick-ask-shortcut',
  'assistant.voice.gemini-key',
] as const;

describe('the Assistant settings root page', () => {
  it('keeps every row it had before regrouping, exactly once', () => {
    for (const id of BEFORE_REGROUPING) {
      expect(
        SETTINGS.filter((setting) => setting.id === id),
        id,
      ).toHaveLength(1);
    }
  });

  it('lists the groups in the designed order', () => {
    const sections = rootRows.reduce<string[]>((groups, setting) => {
      const section = setting.section ?? setting.title;
      return groups.at(-1) === section ? groups : [...groups, section];
    }, []);
    expect(sections).toEqual([
      'Assistant',
      'Models',
      'OpenRouter',
      'Conversation',
      'Voice AI model',
      'Voice and calls',
      'Gemini key',
      'Reaching you',
      'Listening',
      'Phone assistant',
      'Budget and costs',
      'Add-ons',
      'Privacy',
    ]);
  });

  it('offers the phone assistant page on Android only', () => {
    const row = rootRows.find((setting) => setting.title === 'Phone assistant');
    const availability = {
      hasDevices: false,
      hasClimate: false,
      hasCameras: false,
      hasHealth: false,
      hasScenes: false,
      hasEnergy: false,
      hasSecurity: false,
      hasIr: false,
      hasWatch: false,
      needsAttention: false,
    };
    const env = { owner: false, availability } as const;
    expect(row?.visible?.({ ...env, platform: 'android' })).toBe(true);
    expect(row?.visible?.({ ...env, platform: 'web' })).toBe(false);
    expect(row?.visible?.({ ...env, platform: 'desktop' })).toBe(false);
  });

  it('puts name, response style and instructions in the first group', () => {
    const first = rootRows.filter((setting) => setting.section === 'Assistant');
    expect(first.map((setting) => setting.title)).toEqual([
      'Name',
      'Response style',
      'Custom instructions',
      'Test the wake word',
    ]);
  });

  it('puts the setup, thinking, call voice and reset in Voice AI model', () => {
    const model = rootRows.filter((setting) => setting.section === 'Voice AI model');
    expect(model.map((setting) => setting.id)).toEqual([
      'assistant.voice.model-summary',
      'assistant.voice.thinking',
      'assistant.voice.call-voice',
      'assistant.voice.model-reset',
    ]);
  });

  it('puts the spoken lines, call rules and the audio page in Voice and calls', () => {
    const voice = rootRows.filter((setting) => setting.section === 'Voice and calls');
    expect(voice.map((setting) => setting.title)).toEqual([
      'Spoken lines',
      'Voice for spoken lines',
      'End after silence',
      'Call memory',
      'Recent speech in camera calls',
      'Live video in camera calls',
      'Keep the AI connection ready',
      'Mute the camera mic while the AI speaks',
      'Pause room media while the AI speaks',
      'Call audio and video',
    ]);
  });

  it('puts the voice overlay rows right after the Quick Ask shortcut, shown on desktop and web only', () => {
    const conversation = rootRows.filter((setting) => setting.section === 'Conversation');
    const ids = conversation.map((setting) => setting.id);
    const at = ids.indexOf('assistant.quick-ask-shortcut');
    expect(ids.slice(at + 1)).toEqual(OVERLAY_SETTINGS.map((setting) => setting.id));
    const last = conversation[at];
    const availability = {
      hasDevices: false,
      hasClimate: false,
      hasCameras: false,
      hasHealth: false,
      hasScenes: false,
      hasEnergy: false,
      hasSecurity: false,
      hasIr: false,
      hasWatch: false,
      needsAttention: false,
    };
    const env = { owner: false, availability } as const;
    expect(last?.visible?.({ ...env, platform: 'desktop' })).toBe(true);
    expect(last?.visible?.({ ...env, platform: 'web' })).toBe(true);
    expect(last?.visible?.({ ...env, platform: 'android' })).toBe(false);
  });

  it('keeps Clear chat history on the Chat privacy page, open to members', () => {
    const clear = SETTINGS.find((setting) => setting.id === 'assistant.clear');
    expect(clear?.page).toBe('assistant/privacy');
    expect(clear?.visible).toBeUndefined();
  });

  it('links every child page exactly once, visible to the same people as the page', () => {
    const children = ASSISTANT_PAGES.filter((page) => page.parent === 'assistant');
    expect(children.length).toBeGreaterThan(0);
    for (const page of children) {
      const links = SETTINGS.filter((setting) => setting.id === `assistant.page.${page.id}`);
      expect(links, page.id).toHaveLength(1);
      expect(links[0]?.control).toBe('link');
      expect(links[0]?.visible, page.id).toBe(page.visible);
    }
  });

  it('moves the response style rows to their own page', () => {
    const style = SETTINGS.filter((setting) => setting.id.startsWith('assistant.style.'));
    expect(style.length).toBeGreaterThan(0);
    expect(style.every((setting) => setting.page === 'assistant/response-style')).toBe(true);
  });
});
