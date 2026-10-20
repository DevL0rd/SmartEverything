import type { LiveBelt, TreadmillStateView } from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';

export interface BeltNotice {
  readonly key: string;
  readonly tone: StatusTone;
  readonly title: string;
  readonly body: string;
  readonly takeOver: boolean;
}

function linkNotice(view: TreadmillStateView): BeltNotice | null {
  const { link } = view;
  const holder = link.holderName ?? 'another phone';
  const takeOver = !link.holderIsYou && link.holderName !== null;
  switch (link.phase) {
    case 'busy':
      return {
        key: 'busy',
        tone: 'warning',
        title: 'KS Fit is holding the belt',
        body: 'Close KS Fit on every phone. The link continues by itself once it lets go.',
        takeOver: false,
      };
    case 'lost':
      return {
        key: 'lost',
        tone: 'warning',
        title: 'Link lost',
        body: `The last numbers are dimmed. The link is held by ${holder}.`,
        takeOver,
      };
    case 'not_linked':
      return {
        key: 'not_linked',
        tone: 'info',
        title: 'Not linked',
        body: 'The treadmill is not linked to a phone. Switch it on near the phone that holds the link.',
        takeOver,
      };
    case 'searching':
      return {
        key: 'searching',
        tone: 'info',
        title: 'Looking for the treadmill',
        body: 'Stay near it; this usually takes a few seconds.',
        takeOver: false,
      };
    case 'connecting':
      return {
        key: 'connecting',
        tone: 'info',
        title: 'Connecting',
        body: 'The treadmill answers in a moment.',
        takeOver: false,
      };
    case 'linked':
      return null;
  }
}

export type NoticeBelt = Pick<LiveBelt, 'state' | 'controlLost' | 'childLock'>;

function beltNotices(view: TreadmillStateView, belt: NoticeBelt): BeltNotice[] {
  const found: BeltNotice[] = [];
  if (belt.state === 'safety_stop') {
    found.push({
      key: 'safety_stop',
      tone: 'critical',
      title: 'Safety key pulled',
      body: 'The belt stopped and will not restart by itself. Put the key back, then start again.',
      takeOver: false,
    });
  }
  if (view.fault !== null) {
    found.push({
      key: 'fault',
      tone: 'critical',
      title: `Fault ${view.fault.code}`,
      body: `${view.fault.cause} ${view.fault.tip}`,
      takeOver: false,
    });
  }
  if (belt.controlLost) {
    found.push({
      key: 'control_lost',
      tone: 'warning',
      title: 'The belt took control back',
      body: 'The phone asks for control again by itself.',
      takeOver: false,
    });
  }
  if (belt.childLock === true) {
    found.push({
      key: 'child_lock',
      tone: 'info',
      title: 'Child lock is on',
      body: 'Start and speed are disabled. Turn it off in the treadmill settings.',
      takeOver: false,
    });
  }
  return found;
}

function inclineNotice(failure: string | null): BeltNotice[] {
  return failure === null
    ? []
    : [
        {
          key: 'incline_failed',
          tone: 'warning',
          title: 'The incline was not changed',
          body: failure,
          takeOver: false,
        },
      ];
}

export function noticesOf(
  view: TreadmillStateView,
  belt: NoticeBelt,
  inclineFailure: string | null = null,
): readonly BeltNotice[] {
  const link = linkNotice(view);
  return [
    ...(link === null ? [] : [link]),
    ...beltNotices(view, belt),
    ...inclineNotice(inclineFailure),
  ];
}
