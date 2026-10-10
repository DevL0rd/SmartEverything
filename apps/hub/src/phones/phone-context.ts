import type { PhoneReport } from '@smarteverything/domain';
import type { PhoneContextEntry } from '../store/repositories/phone-contexts';
import type { PhoneIdentity } from './phone-device';

export interface ContextStep {
  readonly device: string;
  readonly phone: PhoneIdentity;
  readonly previous: PhoneContextEntry | undefined;
  readonly report: PhoneReport;
}

function sinceOf(step: ContextStep): string | null {
  const changes = step.report.events.filter((event) => event.kind === 'phone_context_changed');
  const latest = changes.at(-1);
  if (latest !== undefined) {
    return latest.at;
  }
  const { previous, report } = step;
  if (previous === undefined) {
    return report.values.phone_context === undefined ? null : report.at;
  }
  const changed =
    report.values.phone_context !== undefined && report.values.phone_context !== previous.state;
  return changed ? report.at : previous.since;
}

type Carried = Pick<PhoneContextEntry, 'state' | 'confidence' | 'place' | 'phoneInUse'>;

const NOTHING_YET: Carried = { state: 'unknown', confidence: null, place: null, phoneInUse: null };

function carried(step: ContextStep): Carried {
  const before = step.previous ?? NOTHING_YET;
  const { values } = step.report;
  return {
    state: values.phone_context ?? before.state,
    confidence: values.context_confidence ?? before.confidence,
    place: values.place === undefined ? before.place : values.place,
    phoneInUse: values.screen_on ?? before.phoneInUse,
  };
}

export function nextContext(step: ContextStep): PhoneContextEntry {
  return {
    ...carried(step),
    deviceId: step.device,
    profileId: step.phone.profileId,
    clientId: step.phone.clientId,
    since: sinceOf(step),
    reportedAt: step.report.at,
  };
}
