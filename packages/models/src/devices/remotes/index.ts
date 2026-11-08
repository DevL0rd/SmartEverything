import type { ModelSpec } from '@smarteverything/domain';
import { AC_REMOTE_MODEL } from './ac';
import { FAN_REMOTE_MODEL } from './fan';
import { LIGHT_REMOTE_MODEL } from './light';
import { OTHER_REMOTE_MODEL } from './other';
import { PROJECTOR_REMOTE_MODEL } from './projector';
import { SET_TOP_REMOTE_MODEL } from './set-top';
import { SPEAKER_REMOTE_MODEL } from './speaker';
import { TV_REMOTE_MODEL } from './tv';

export {
  AC_REMOTE_MODEL,
  FAN_REMOTE_MODEL,
  LIGHT_REMOTE_MODEL,
  OTHER_REMOTE_MODEL,
  PROJECTOR_REMOTE_MODEL,
  SET_TOP_REMOTE_MODEL,
  SPEAKER_REMOTE_MODEL,
  TV_REMOTE_MODEL,
};

export const REMOTE_MODELS: readonly ModelSpec[] = [
  AC_REMOTE_MODEL,
  FAN_REMOTE_MODEL,
  LIGHT_REMOTE_MODEL,
  SPEAKER_REMOTE_MODEL,
  PROJECTOR_REMOTE_MODEL,
  SET_TOP_REMOTE_MODEL,
  TV_REMOTE_MODEL,
  OTHER_REMOTE_MODEL,
];
