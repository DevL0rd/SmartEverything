import {
  vacuumFaultCodes,
  vacuumJob,
  vacuumStation,
  type VacuumValues,
} from '@smarteverything/domain';
import { readingOf } from './readings';

export function readProblems(values: VacuumValues): readonly string[] {
  return [
    readingOf(() => vacuumStation(values)),
    readingOf(() => vacuumJob(values)),
    readingOf(() => vacuumFaultCodes(values)),
  ].flatMap((reading) => (reading.ok ? [] : [reading.problem]));
}
