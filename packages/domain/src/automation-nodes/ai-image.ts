import type { FlowType } from '../automation-v3/types';
import { defineNodeKind, type InputPortDecl, type NodeKind } from './define';
import { ERROR_OUT } from './error-port';

const TEXT: FlowType = { t: 'text' };

export const IMAGE_TIMEOUT_MS = 120_000;

export const IMAGE_ASPECT_CHOICES = [
  { id: '1:1', label: 'Square' },
  { id: '16:9', label: 'Wide' },
  { id: '9:16', label: 'Tall' },
  { id: '4:3', label: 'Landscape 4:3' },
  { id: '3:2', label: 'Landscape 3:2' },
  { id: '2:3', label: 'Portrait 2:3' },
] as const;

export const IMAGE_RESOLUTION_CHOICES = [
  { id: '1K', label: 'Standard' },
  { id: '2K', label: 'Large (2K)' },
  { id: '4K', label: 'Largest (4K)' },
] as const;

export const IMAGE_BACKGROUND_CHOICES = [
  { id: 'auto', label: 'Let the model choose' },
  { id: 'opaque', label: 'Solid background' },
  { id: 'transparent', label: 'Cut out, no background' },
] as const;

function choice(
  name: string,
  options: readonly { readonly id: string; readonly label: string }[],
  description: string,
  label: string,
): InputPortDecl {
  return {
    name,
    type: { t: 'optional', of: { t: 'choice', options: [...options] } },
    required: false,
    static: true,
    description,
    ui: { label },
  };
}

const AI_IMAGE = defineNodeKind({
  id: 'ai.image',
  name: 'Make a picture',
  category: 'ai',
  icon: 'image',
  class: 'effect',
  description:
    'Makes a new picture from a description. It is made in a chat of its own for this automation and costs what the picture model charges. Waiting continues when the picture is ready and gives its id, which works wherever a Camera picture id does: a push message, a Discord message or a print. Sending continues as soon as the request is accepted and gives no picture. Pictures wired into references steer the style, the composition or the subject.',
  inputs: [
    {
      name: 'prompt',
      type: TEXT,
      required: true,
      live: true,
      summary: true,
      description: 'What to make, as a clear description.',
    },
    {
      name: 'model',
      type: { t: 'optional', of: TEXT },
      required: false,
      static: true,
      description: 'The picture model. The one picked in the AI settings when left out.',
      ui: { label: 'Model', optionsFrom: 'models.image' },
    },
    choice('aspect', IMAGE_ASPECT_CHOICES, 'The shape of the picture.', 'Shape'),
    choice(
      'resolution',
      IMAGE_RESOLUTION_CHOICES,
      'How large the picture is. The size saved for the picture model in the app when left out.',
      'Size',
    ),
    choice(
      'background',
      IMAGE_BACKGROUND_CHOICES,
      'Whether the picture has a background or is cut out.',
      'Background',
    ),
    {
      name: 'references',
      type: { t: 'optional', of: { t: 'list', of: TEXT } },
      required: false,
      live: true,
      description:
        'Pictures that steer the result, as picture ids from Camera picture or an earlier Make a picture.',
    },
    {
      name: 'timeout',
      type: { t: 'duration' },
      required: false,
      default: IMAGE_TIMEOUT_MS,
      static: true,
      description:
        'How long to wait for the picture before giving up. The request is then cancelled.',
      ui: { label: 'Give up after', editor: 'duration' },
    },
  ],
  outputs: [
    {
      name: 'picture',
      type: TEXT,
      optional: true,
      description:
        'The picture id. Give it to a push message, a Discord message or a print. Only set when the step waited for the picture.',
    },
    {
      name: 'cost',
      type: { t: 'number', min: 0, unit: 'USD' },
      optional: true,
      description: 'What the picture cost. Only set when the step waited for the picture.',
    },
    ERROR_OUT,
  ],
  exits: ['next'],
  effect: { retry: 'external', budget: 'effects_person', mode: 'wait_for_result' },
  summary: 'Make a picture {prompt}',
  keywords: [
    'ai',
    'image',
    'picture',
    'generate',
    'draw',
    'art',
    'photo',
    'illustration',
    'create',
    'make',
  ],
  access: 'owner',
  tier: 'v1.1',
});

export const AI_IMAGE_KINDS: readonly NodeKind[] = [AI_IMAGE];
