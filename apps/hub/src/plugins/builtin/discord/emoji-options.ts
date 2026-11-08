import type { PluginOption } from '@smarteverything/domain';
import { z } from 'zod';
import unicode from './unicode-emojis.json';

const UNICODE_EMOJIS = z.array(z.tuple([z.string().min(1), z.string().min(1)]));

export const UNICODE_EMOJI_OPTIONS: readonly PluginOption[] = UNICODE_EMOJIS.parse(unicode).map(
  ([emoji, name]) => ({
    id: emoji,
    label: `${emoji} ${name}`,
    detail: 'Emoji',
    color: null,
    image: null,
  }),
);
