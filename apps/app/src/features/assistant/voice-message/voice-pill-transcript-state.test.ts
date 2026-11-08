import { describe, expect, it } from 'vitest';
import type { AssistantAttachment } from '@smarteverything/domain';
import {
  toggleVoiceTranscript,
  voiceClipOf,
  voiceTranscriptOpen,
} from './voice-pill-transcript-state';

function attachment(id: string, mime: string): AssistantAttachment {
  return { id, name: 'clip', mime, bytes: 10, width: null, height: null };
}

describe('voice transcript toggle', () => {
  it('finds the voice clip among the attachments', () => {
    expect(voiceClipOf([attachment('a', 'image/png'), attachment('b', 'audio/wav')])).toBe('b');
    expect(voiceClipOf([attachment('a', 'application/pdf')])).toBeNull();
  });

  it('opens and closes the transcript of one clip only', () => {
    toggleVoiceTranscript('clip-1');
    expect(voiceTranscriptOpen('clip-1')).toBe(true);
    expect(voiceTranscriptOpen('clip-2')).toBe(false);
    toggleVoiceTranscript('clip-1');
    expect(voiceTranscriptOpen('clip-1')).toBe(false);
  });
});
