import { z } from 'zod';
import { MOMENT } from './api/primitives';

export const SHARED_CLIPBOARD_PREF = z.strictObject({
  enabled: z
    .boolean()
    .describe(
      'Whether text copied on one of this person’s devices is offered to their other devices',
    ),
});

export type SharedClipboardPref = z.infer<typeof SHARED_CLIPBOARD_PREF>;

export const CLIPBOARD_CLIP = z.strictObject({
  text: z.string().min(1),
  from: z.uuid(),
  at: MOMENT,
});

export type ClipboardClip = z.infer<typeof CLIPBOARD_CLIP>;

export const CLIPBOARD_NOTICE = CLIPBOARD_CLIP.extend({ type: z.literal('clipboard') });

export type ClipboardNotice = z.infer<typeof CLIPBOARD_NOTICE>;
