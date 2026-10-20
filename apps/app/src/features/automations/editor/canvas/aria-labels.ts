import type { AriaLabelConfig } from '@xyflow/react';

export const CANVAS_ARIA_LABELS: Partial<AriaLabelConfig> = {
  'node.a11yDescription.default':
    'Press Enter to open the details, Space to select, arrow keys to move between steps.',
  'node.a11yDescription.keyboardDisabled': 'Open this step to change it.',
  'node.a11yDescription.ariaLiveMessage': () => '',
  'edge.a11yDescription.default': '',
  'handle.ariaLabel': '',
  'minimap.ariaLabel': 'Overview of the automation',
};
