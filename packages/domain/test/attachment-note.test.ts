import { describe, expect, it } from 'vitest';
import { attachmentNote, mediaPlan } from '../src/attachment-note';

const IMAGE = {
  id: 'a1',
  name: 'shot.png',
  mime: 'image/png',
  bytes: 2048,
  width: 800,
  height: 600,
};
const AUDIO = {
  ...IMAGE,
  id: 'b2',
  name: 'clip.ogg',
  mime: 'audio/ogg',
  width: null,
  height: null,
};

describe('attachmentNote', () => {
  it('carries details, the description and the read hint', () => {
    const line = attachmentNote(IMAGE, 'a cat on a sofa');
    expect(line).toContain('image "shot.png", image/png, 800×600, 2048 bytes · id a1');
    expect(line).toContain('Description: a cat on a sofa');
    expect(line).toContain('chat_read view attachment with id a1');
  });

  it('carries details and the hint when there is no description', () => {
    const line = attachmentNote(IMAGE, null);
    expect(line).toContain('id a1');
    expect(line).not.toContain('Description');
    expect(line).toContain('chat_read view attachment with id a1');
  });

  it('says pending while the note is being made, keeping details and hint', () => {
    const line = attachmentNote(AUDIO, null, { pending: true });
    expect(line).toContain('Transcript pending.');
    expect(line).toContain('audio "clip.ogg"');
    expect(line).toContain('chat_read view attachment with id b2');
  });

  it('leaves other files as a plain tag', () => {
    expect(
      attachmentNote({ ...IMAGE, mime: 'application/pdf', width: null, height: null }, null),
    ).toBe('[Attached shot.png (application/pdf)]');
  });
});

describe('mediaPlan', () => {
  it('shows a vision model the image and describes it only when asked', () => {
    expect(mediaPlan('image/png', ['text', 'image'], false)).toEqual({
      native: true,
      describe: false,
    });
    expect(mediaPlan('image/png', ['text', 'image'], true)).toEqual({
      native: true,
      describe: true,
    });
  });

  it('always describes an image for a model that cannot see', () => {
    expect(mediaPlan('image/png', ['text'], false)).toEqual({ native: false, describe: true });
    expect(mediaPlan('image/png', ['text'], true)).toEqual({ native: false, describe: true });
  });

  it('leaves audio to a model that hears and transcribes for one that does not', () => {
    expect(mediaPlan('audio/ogg', ['text', 'audio'], true)).toEqual({
      native: true,
      describe: false,
    });
    expect(mediaPlan('audio/ogg', ['text', 'image'], false)).toEqual({
      native: false,
      describe: true,
    });
    expect(mediaPlan('video/mp4', ['text', 'image'], false)).toEqual({
      native: false,
      describe: true,
    });
    expect(mediaPlan('video/mp4', ['text', 'video'], false)).toEqual({
      native: true,
      describe: false,
    });
  });

  it('treats unknown modalities as unsupported', () => {
    expect(mediaPlan('image/png', null, false)).toEqual({ native: false, describe: true });
  });

  it('ignores files that are not media', () => {
    expect(mediaPlan('application/pdf', ['text'], true)).toEqual({
      native: false,
      describe: false,
    });
  });
});
