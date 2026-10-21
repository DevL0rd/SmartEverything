import type { Served } from './served-types';

export const SERVED_IMAGES = [
  {
    name: 'image_gen',
    area: 'assistant',
    access: 'control',
    title: 'Generate or edit images',
    line: 'Generate or edit a picture and wait for it',
    description:
      'Makes images: generate makes a new image (no input image, or images only as style, composition, mood or subject references), edit changes the source image while preserving what the prompt does not change; both wait and return the finished, failed, cancelled or unknown image with its operationId and saved attachment ids. After an error or timeout the image may still finish in the chat, so never start it again. cancel stops a running operation.',
    route: {
      key: 'action',
      branches: {
        generate: {
          part: 'generate_image_operation',
          line: 'Make a new image, optionally from style references, and wait for it',
        },
        edit: {
          part: 'edit_image_operation',
          line: 'Change the source image while preserving the rest, and wait for it',
        },
        cancel: {
          part: 'cancel_image_operation',
          line: 'Cancel an image that is still being made',
        },
      },
    },
  },
] as const satisfies readonly Served[];
