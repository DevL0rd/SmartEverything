import type { ProfileRow } from '@smarteverything/domain';
import { Remembered } from '../remembered';

export const ACTIVE_PROFILES = new Remembered<ProfileRow>();
