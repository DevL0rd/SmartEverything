import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_SETTINGS_CHANGE } from '@smarteverything/domain';
import { EntityStore } from '../../../store/entity-store';

const updateAssistantSettings = vi.fn();
vi.mock('../../../api/assistant', () => ({ updateAssistantSettings }));

const { writeAssistant, writeVoice } = await import('./assistant-write');

const store = new EntityStore();
const context = { store, state: store.get() };

beforeEach(() => {
  updateAssistantSettings.mockReset().mockResolvedValue({ settings: {} });
});

describe('assistant settings writes', () => {
  it('sends only the changed voice field', async () => {
    await writeVoice({ pause_media_while_speaking: false }, context);
    expect(updateAssistantSettings).toHaveBeenCalledWith({
      voice: { pause_media_while_speaking: false },
    });
  });

  it('sends only the name when the name changes', async () => {
    await writeAssistant({ name: 'Mo Mo' }, context);
    expect(updateAssistantSettings).toHaveBeenCalledWith({ name: 'Mo Mo' });
  });

  it('keeps a body of one field one field after validation', () => {
    expect(ASSISTANT_SETTINGS_CHANGE.parse({ aliases: ['momo'] })).toEqual({ aliases: ['momo'] });
  });
});
