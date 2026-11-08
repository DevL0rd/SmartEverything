import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind, type OutputPortDecl } from './define';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };
const BOOLEAN: FlowType = { t: 'boolean' };

export const CALL_DEVICE_CHOICES = [
  { id: 'phone', label: 'Their phone' },
  { id: 'desktop', label: 'Their computer app' },
  { id: 'any', label: 'Any of their apps' },
] as const;

export const CALL_OUTCOME_CHOICES = [
  { id: 'answered', label: 'Answered' },
  { id: 'declined', label: 'Declined' },
  { id: 'missed', label: 'Not answered in time' },
  { id: 'cancelled', label: 'Stopped before anyone answered' },
] as const;

const REASON: InputPortDecl = {
  name: 'reason',
  type: TEXT,
  required: true,
  live: true,
  description: 'Why you are calling, in a sentence. The conversation opens with it.',
  summary: true,
  ui: { label: 'Reason' },
};

const URGENT: InputPortDecl = {
  name: 'urgent',
  type: BOOLEAN,
  required: false,
  default: false,
  static: true,
  description: 'Let the call through a person’s quiet hours when they allow urgent calls.',
  ui: { label: 'Urgent' },
};

const OUTREACH_ID: OutputPortDecl = {
  name: 'outreachId',
  type: TEXT,
  description: 'The id of the call. Wire it to End a call to hang up.',
};

const callPerson = defineNodeKind({
  id: 'call.person',
  name: 'Call a person',
  category: 'notify',
  icon: 'phone',
  class: 'effect',
  description:
    'Rings a person’s phone or computer app for a live voice conversation with the assistant; the first app to answer wins. Waiting continues when they answer or decline (answered says which), and takes the timed out exit when the ring runs out. Sending continues as soon as it rings. Quiet hours refuse the call unless it is urgent and they allow that.',
  inputs: [
    {
      name: 'person',
      type: { t: 'ref', of: 'person' },
      required: true,
      description: 'Who to call.',
      summary: true,
    },
    {
      name: 'device',
      type: { t: 'choice', options: [...CALL_DEVICE_CHOICES] },
      required: false,
      default: 'any',
      static: true,
      description: 'Which of their apps ring.',
      summary: true,
      ui: { label: 'Ring' },
    },
    REASON,
    URGENT,
  ],
  outputs: [
    OUTREACH_ID,
    {
      name: 'answered',
      type: BOOLEAN,
      optional: true,
      description: 'Whether they answered. Only set when the step waited for the outcome.',
    },
    {
      name: 'outcome',
      type: { t: 'choice', options: [...CALL_OUTCOME_CHOICES] },
      optional: true,
      description: 'How the ring ended. Only set when the step waited for the outcome.',
    },
    {
      name: 'timedOut',
      type: BOOLEAN,
      optional: true,
      description:
        'Whether the ring ran out before anyone answered. Only set when the step waited.',
    },
    ERROR_OUT,
  ],
  exits: ['next', 'timedOut'],
  scopes: { required: [], optional: ['timedOut'] },
  effect: { retry: 'external', budget: 'effects_person', mode: 'wait_for_result' },
  summary: 'Call {person} about {reason}',
  keywords: ['call', 'ring', 'phone', 'voice', 'talk', 'conversation', 'assistant', 'person'],
  access: 'member',
  tier: 'v1.1',
});

const callOpen = defineNodeKind({
  id: 'call.open',
  name: 'Talk through a device',
  category: 'notify',
  icon: 'radio',
  class: 'effect',
  description:
    'Starts a live voice conversation with the assistant through a camera, doorbell or speaker device, or with everyone on a Talk channel. Pick one device or one channel. It continues once the conversation has started.',
  inputs: [
    {
      name: 'device',
      type: {
        t: 'optional',
        of: { t: 'ref', of: 'device', families: ['camera', 'doorbell', 'speaker'] },
      },
      required: false,
      description: 'The camera, doorbell or speaker to talk through.',
      summary: true,
    },
    {
      name: 'channel',
      type: { t: 'optional', of: TEXT },
      required: false,
      static: true,
      description: 'The Talk channel to talk on; every member hears it.',
      summary: true,
      ui: { label: 'Talk channel', optionsFrom: 'talk.channels' },
    },
    REASON,
    URGENT,
  ],
  outputs: [OUTREACH_ID, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects_person' },
  summary: 'Talk about {reason}',
  keywords: ['talk', 'conversation', 'voice', 'camera', 'speaker', 'walkie', 'channel', 'open'],
  access: 'member',
  tier: 'v1.1',
});

const callEnd = defineNodeKind({
  id: 'call.end',
  name: 'End a call',
  category: 'notify',
  icon: 'phoneOff',
  class: 'effect',
  description:
    'Hangs up a call or conversation the assistant started: stops a ringing call or ends a live camera or channel conversation. Wire in the call id from Call a person or Talk through a device.',
  inputs: [
    {
      name: 'outreachId',
      type: TEXT,
      required: true,
      live: true,
      description: 'The id of the call to end.',
      summary: true,
      ui: { label: 'Call' },
    },
  ],
  outputs: [{ name: 'ok', type: BOOLEAN, description: 'Whether the call was ended.' }, ERROR_OUT],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'effects_person' },
  summary: 'End call {outreachId}',
  keywords: ['hang up', 'end', 'stop', 'call', 'ring', 'cancel'],
  access: 'member',
  tier: 'v1.1',
});

export const CALL_KINDS: readonly NodeKind[] = [callPerson, callOpen, callEnd];
