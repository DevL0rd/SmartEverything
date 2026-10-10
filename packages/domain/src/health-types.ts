import type { z } from 'zod';
import { HEALTH_RECORD_VARIANTS, type HealthRecordType } from './health';
import { isIntervalEntry, isLoggable } from './health-entries';

export interface HealthTypeInfo {
  readonly type: HealthRecordType;
  readonly loggable: boolean;
  readonly span: 'instant' | 'interval';
  readonly endRequired: boolean;
  readonly data: z.ZodType;
}

class UnknownHealthTypeError extends Error {
  override readonly name = 'UnknownHealthTypeError';

  constructor(type: string) {
    super(`The health record type ${type} has no variant in HEALTH_RECORD_VARIANTS.`);
  }
}

function infoOf(variant: (typeof HEALTH_RECORD_VARIANTS)[number]): HealthTypeInfo {
  const type = variant.shape.type.value;
  const loggable = isLoggable(type);
  return {
    type,
    loggable,
    span: variant.shape.endTime.safeParse(null).success ? 'instant' : 'interval',
    endRequired: loggable && isIntervalEntry(type),
    data: variant.shape.data,
  };
}

export const HEALTH_TYPE_INFO: readonly HealthTypeInfo[] = HEALTH_RECORD_VARIANTS.map(infoOf);

export function healthTypeInfo(type: HealthRecordType): HealthTypeInfo {
  const found = HEALTH_TYPE_INFO.find((info) => info.type === type);
  if (found === undefined) {
    throw new UnknownHealthTypeError(type);
  }
  return found;
}
