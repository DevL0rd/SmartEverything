import { FadeIn, FadeOut } from 'react-native-reanimated';
import { DURATION, EASING } from '../../../design/motion';

export const RISE_PX = { send: 16, reply: 8, step: 6, bar: 4, pill: 12 } as const;

export const RISE_MS = { send: 200, reply: DURATION.medium, step: DURATION.short } as const;

export const MESSAGE_FADE = FadeIn.duration(180);

export const REPLY_SINK = FadeOut.duration(DURATION.short).easing(EASING.accelerate);

export const ROW_EXIT = FadeOut.duration(DURATION.short);

export const PILL_OUT = FadeOut.duration(DURATION.short);
