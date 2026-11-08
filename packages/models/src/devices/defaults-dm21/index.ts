import type { ModelSpec } from '@smarteverything/domain';
import { DOME_CAMERA_MODEL } from './dome-camera';
import { VIDEO_DOORBELL_MODEL } from './doorbell';
import { ROBOT_VACUUM_MODEL } from './robot-vacuum';
import { SMART_SPEAKER_MODEL } from './speaker';

export { DOME_CAMERA_MODEL, ROBOT_VACUUM_MODEL, SMART_SPEAKER_MODEL, VIDEO_DOORBELL_MODEL };

export const DEFAULT_MEDIA_CLEANING_MODELS: readonly ModelSpec[] = [
  SMART_SPEAKER_MODEL,
  DOME_CAMERA_MODEL,
  VIDEO_DOORBELL_MODEL,
  ROBOT_VACUUM_MODEL,
];
