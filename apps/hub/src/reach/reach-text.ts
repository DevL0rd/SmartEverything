import type { AiOutreachRow } from '@smarteverything/domain';

const HOW_WORDS: Readonly<Record<AiOutreachRow['how'], string>> = {
  phone: 'phone',
  desktop: 'computer',
  app: 'phone or computer',
  camera: 'camera',
  channel: 'walkie-talkie channel',
  message: 'message',
};

export function callOpening(row: AiOutreachRow): string {
  return [
    `You started this call to ${row.target_label} on their ${HOW_WORDS[row.how]}.`,
    `Why: ${row.reason}`,
    'They just answered: greet them and say why you called.',
  ].join('\n');
}

export function cameraOpening(
  camera: { readonly id: string; readonly name: string },
  reason: string,
  listenFirst: boolean,
  liveVideo: boolean,
): string {
  const sight = liveVideo
    ? 'You see through it live: its video reaches you about once a second, so answer what you see directly. camera_pictures is for other cameras and saved pictures.'
    : `You can see through it: camera_pictures with view "live" and deviceIds ["${camera.id}"] shows what it sees right now. Use it whenever they ask what you see, what they are holding or wearing, or to look at something.`;
  return [
    `You are now talking through ${camera.name}’s speaker and microphone to whoever is there.`,
    sight,
    `Why: ${reason}`,
    listenFirst ? 'Their words follow as audio; answer them.' : 'Speak first.',
  ].join('\n');
}

export function channelOpening(channelName: string, text: string): string {
  return [
    `You are now talking live on the walkie-talkie channel ${channelName}; everyone on it hears you and can answer without pressing anything.`,
    `Why: ${text}`,
    'Speak first.',
  ].join('\n');
}

const OUTCOMES: Readonly<Record<AiOutreachRow['state'], string>> = {
  ringing: 'is ringing',
  live: 'is live',
  ended: 'ended',
  missed: 'was not answered',
  declined: 'was declined',
  failed: 'failed',
  sent: 'was sent',
};

export function outcomeText(row: AiOutreachRow): string {
  const what = `Your ${HOW_WORDS[row.how]} outreach to ${row.target_label}`;
  return [
    `[Outreach] ${what} ${OUTCOMES[row.state]}.`,
    ...(row.detail === null ? [] : [row.detail]),
    `You reached out because: ${row.reason}`,
    'Decide what to do next, if anything.',
  ].join('\n');
}

export const STARTED_HINT =
  'Started. If you are in a voice call with this person right now, say goodbye and end that call.';
