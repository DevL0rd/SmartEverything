import type { Served } from './served-types';

export const SERVED_IMAGES = [
  [
    'list_image_endpoints',
    'assistant',
    'read',
    'Read image endpoints',
    'Lists the image models that can create or edit pictures, with prices and whether this chat may use them; read it before starting an image.',
    { part: 'list_image_endpoints' },
  ],
  [
    'edit_image',
    'assistant',
    'control',
    'Create or edit images',
    'Creates or edits an image, picture or drawing from a prompt, a source image or references; it returns at once and the app shows progress and the saved image, so do not poll and wait only when later work needs the image.',
    {
      key: 'action',
      parts: {
        start: 'start_image_operation',
        cancel: 'cancel_image_operation',
        resolve: 'resolve_image_input',
        wait: 'wait_for_images',
      },
      says: {
        start: 'Generate or edit an image with an endpoint from list_image_endpoints',
        cancel: 'Cancel an image that is still being made',
        resolve: 'Turn a chat image into an attachment id for an edit or a reference',
        wait: 'Wait once for images still being made when further work needs them',
      },
    },
  ],
] as const satisfies readonly Served[];
