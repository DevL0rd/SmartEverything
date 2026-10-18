import { asleepMinutes, type HealthRecord, type HealthRecordType } from '@smarteverything/domain';
import { MINUTE_MS } from '../../../format/time';
import { endOf, startOf } from './records';

export interface Point {
  readonly at: number;
  readonly value: number;
  readonly low: number;
  readonly high: number;
}

interface Sample {
  readonly time: string;
  readonly value: number;
}

type DataByType = { readonly [R in HealthRecord as R['type']]: R['data'] };

type DataOf<T extends HealthRecordType> = DataByType[T];

type TypedRecord<T extends HealthRecordType> = HealthRecord & { readonly data: DataOf<T> };

export function isTypedRecord<T extends HealthRecordType>(
  record: HealthRecord,
  type: T,
): record is TypedRecord<T> {
  return record.type === type;
}

export type SeriesRead<T extends HealthRecordType> =
  | { readonly kind: 'field'; readonly value: (data: DataOf<T>) => number | null }
  | {
      readonly kind: 'pair';
      readonly high: (data: DataOf<T>) => number;
      readonly low: (data: DataOf<T>) => number;
    }
  | { readonly kind: 'samples'; readonly samples: (data: DataOf<T>) => readonly Sample[] }
  | { readonly kind: 'duration' }
  | { readonly kind: 'occurrence' };

export type ReadKind = SeriesRead<HealthRecordType>['kind'];

function single(at: number, value: number): Point {
  return { at, value, low: value, high: value };
}

export function readPoints<T extends HealthRecordType>(
  read: SeriesRead<T>,
  record: TypedRecord<T>,
): readonly Point[] {
  switch (read.kind) {
    case 'field': {
      const value = read.value(record.data);
      return value === null ? [] : [single(startOf(record), value)];
    }
    case 'pair': {
      const high = read.high(record.data);
      return [{ at: startOf(record), value: high, low: read.low(record.data), high }];
    }
    case 'samples':
      return read
        .samples(record.data)
        .map((sample) => single(Date.parse(sample.time), sample.value));
    case 'duration':
      return isTypedRecord(record, 'SleepSession')
        ? [single(endOf(record), asleepMinutes(record))]
        : [single(startOf(record), (endOf(record) - startOf(record)) / MINUTE_MS)];
    case 'occurrence':
      return [single(startOf(record), 1)];
  }
}
