import { STARTER_NODE_IDS, type StarterNode } from './ids';

export const SPEAK_OR_PUSH: StarterNode = {
  id: STARTER_NODE_IDS.speakOrPush,
  name: 'Say it, or push it',
  program: {
    version: 4,
    kind: 'function',
    flavour: 'action',
    description:
      'Says the text on a speaker; when the speaker cannot be reached, sends it to the people as a notification.',
    category: 'notify',
    icon: 'megaphone',
    inputs: [
      {
        name: 'speaker',
        type: { t: 'ref', of: 'target' },
        required: true,
        description: 'The speaker to talk on.',
      },
      {
        name: 'people',
        type: { t: 'list', of: { t: 'ref', of: 'person' } },
        required: true,
        description: 'The people to notify when the speaker is unreachable.',
      },
      { name: 'text', type: { t: 'text' }, required: true, description: 'What to say.' },
    ],
    outputs: [
      { name: 'spoken', type: { t: 'boolean' }, description: 'Whether the speaker said it.' },
    ],
    exits: ['done'],
    variables: [{ name: 'spoken', type: { t: 'boolean' }, initial: { lit: false } }],
    nodes: [
      {
        id: '2651eada-bd89-8eeb-9d51-6babfdd32cee',
        key: 'start',
        kind: 'flow.start',
        to: { next: 'try' },
      },
      {
        id: 'b0000000-0004-4000-8000-000000000005',
        key: 'try',
        kind: 'flow.try',
        to: { next: 'result', try: 'say' },
        catches: [
          { id: 'b0000000-0004-4000-8000-000000000004', classes: ['Unreachable'], to: 'push' },
        ],
      },
      {
        id: 'b0000000-0004-4000-8000-000000000001',
        key: 'say',
        kind: 'notify.speak',
        ports: {
          target: { wire: { from: 'inputs', port: 'speaker' } },
          text: { wire: { from: 'inputs', port: 'text' } },
        },
        policy: { mode: 'wait_for_result' },
        to: { next: 'said' },
      },
      {
        id: 'b0000000-0004-4000-8000-000000000002',
        key: 'said',
        kind: 'var.set',
        ports: { name: { lit: 'spoken' }, to: { wire: { from: 'say', port: 'ok' } } },
      },
      {
        id: 'b0000000-0004-4000-8000-000000000003',
        key: 'push',
        kind: 'notify.person',
        ports: {
          people: { wire: { from: 'inputs', port: 'people' } },
          title: { lit: 'Home' },
          body: { wire: { from: 'inputs', port: 'text' } },
        },
      },
      {
        id: 'b0000000-0004-4000-8000-000000000006',
        key: 'result',
        kind: 'flow.return',
        ports: { spoken: { wire: { from: 'vars', port: 'spoken' } } },
      },
    ],
  },
};
