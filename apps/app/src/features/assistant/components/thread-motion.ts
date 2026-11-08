import { FadeOut } from 'react-native-reanimated';
import { DURATION, EASING } from '../../../design/motion';

export const ROW_RISE = { px: 6, ms: 180 } as const;

export const RISE_PX = { step: 6, pill: 12 } as const;

export const RISE_MS = { step: DURATION.short } as const;

export const REPLY_SINK = FadeOut.duration(DURATION.short).easing(EASING.accelerate);

export const ROW_EXIT = FadeOut.duration(DURATION.short);

export const PILL_OUT = FadeOut.duration(DURATION.short);
