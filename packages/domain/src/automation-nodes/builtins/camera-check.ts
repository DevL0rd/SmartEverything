import type { BuiltinFunction } from './build';
import { TEXT, action, builtin, kit, lit, output, required, wire } from './build';

const look = kit(14);

export const CAMERA_CHECK: BuiltinFunction = builtin(
  'camera_check',
  1,
  'Camera check',
  action({
    description:
      'Takes a picture from a camera, asks the AI a question about it, and leaves by the yes or no exit.',
    category: 'cameras',
    icon: 'scan-eye',
    inputs: [
      required('camera', { t: 'ref', of: 'camera' }, 'The camera to look through.'),
      required('question', TEXT, 'What to find out, for example whether a person is at the door.'),
    ],
    outputs: [output('answer', TEXT, 'What the AI saw, in words.')],
    exits: ['yes', 'no'],
    body: [
      look.node('picture', 'camera.snapshot', { camera: wire('inputs', 'camera') }),
      look.node('seen', 'ai.vision', {
        question: wire('inputs', 'question'),
        image: wire('picture', 'image'),
      }),
      look.node('verdict', 'ai.decide', {
        question: lit('Does this answer say yes?'),
        context: wire('seen', 'answer'),
      }),
      look.when(
        'yes',
        wire('verdict', 'answer'),
        [look.node('found', 'flow.return', { exit: lit('yes'), answer: wire('seen', 'answer') })],
        [look.node('missing', 'flow.return', { exit: lit('no'), answer: wire('seen', 'answer') })],
      ),
    ],
  }),
);
