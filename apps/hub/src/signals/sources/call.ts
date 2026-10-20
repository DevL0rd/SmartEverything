import type { SignalInput } from '@smarteverything/domain';
import type { CallMoment } from '../../assistant-voice/call-moments';

export function callSignal(moment: CallMoment): SignalInput {
  const common = {
    source: 'call',
    subject: moment.profileId,
    field: null,
    previous: null,
    at: moment.at.toISOString(),
    profileId: moment.profileId,
  } as const;
  const data = {
    callId: moment.callId,
    source: moment.source,
    person: moment.person,
    device: moment.device,
  };
  return moment.kind === 'started'
    ? { ...common, kind: 'started', value: true, data }
    : {
        ...common,
        kind: 'ended',
        value: moment.durationSeconds,
        data: { ...data, ending: moment.ending, durationSeconds: moment.durationSeconds },
      };
}
