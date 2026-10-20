export const STATES_COPY = {
  emptyAutomations: {
    title: 'Automate your home',
    body: 'Connect devices, times and events into steps that run on their own.',
    start: 'Start from scratch',
    ask: 'Ask the assistant',
    templates: 'Start from an idea',
    illustration: 'Three connected steps: a trigger leads to a condition, then to an action.',
  },
  emptyRuns: {
    title: 'No runs yet',
    body: 'Use Test to try it safely.',
    test: 'Test',
  },
  emptyNodes: {
    title: 'No Custom Nodes yet',
    body: 'Select steps in any automation and choose Make Custom Node.',
    create: 'New Custom Node',
    illustration: 'Three frames: select steps, make them a Custom Node, use them again.',
  },
  newCanvas: {
    trigger: 'Add a trigger. What starts it?',
    step: 'Add a step',
    triggerHint: 'Opens the palette to choose what starts this automation',
    stepHint: 'Opens the palette to choose what happens',
  },
  offline: {
    title: 'Can’t reach the Home Hub',
    unsaved: 'Your last change is not saved. It saves when the connection returns.',
    paused: 'Editing is paused until the connection returns.',
    retry: 'Try again',
  },
  missingKind: {
    title: (name: string): string => `Missing node: ${name}`,
    body: 'This node is no longer available, so the automation can’t be published.',
    replace: 'Replace',
    remove: 'Delete',
  },
  removedRef: {
    label: (name: string): string => `${name} (removed)`,
    hint: 'This item no longer exists. Pick another one.',
  },
  reopening: {
    title: 'The canvas closed. Reopening…',
    body: 'You can keep using the outline.',
  },
  memberReadonly: {
    title: (author: string): string => `Made by ${author}. Ask the owner to change it.`,
    unknownAuthor: 'someone else',
    node: (reason: string): string => `Unavailable. ${reason}`,
  },
} as const;
