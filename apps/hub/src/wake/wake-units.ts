import type { WakeAiAction } from '@smarteverything/domain';
import type { ActionOrigin } from '../automations/automation-ai';
import { storeUnit } from '../store/host/unit';
import { wakeRefusal, type WakeRefusal } from './wake-refusal';
import { WakeText, type WakeLines, type WakeOccasion } from './wake-text';

export interface WakeRead {
  readonly action: WakeAiAction;
  readonly origin: ActionOrigin;
  readonly occasion: WakeOccasion;
}

export interface WakeReading {
  readonly refusal: WakeRefusal | null;
  readonly lines: WakeLines;
}

export const WAKE_READ_UNIT = storeUnit((store, input: WakeRead): WakeReading => ({
  refusal: wakeRefusal(store, input.action, input.origin),
  lines: new WakeText(store).lines(input.occasion),
}));
