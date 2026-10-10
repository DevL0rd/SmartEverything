import type { LogForm } from './form-kit';
import { MEASURE_FORMS } from './forms-measures';
import { SESSION_FORMS } from './forms-sessions';

export type { LogField, LogForm } from './form-kit';

export const LOG_FORMS: readonly LogForm[] = [...MEASURE_FORMS, ...SESSION_FORMS];

export const LOG_GROUPS: readonly string[] = ['Body', 'Vitals', 'Activity & rest', 'Cycle'];

export function logFormOf(type: string): LogForm | null {
  return LOG_FORMS.find((form) => form.type === type) ?? null;
}
