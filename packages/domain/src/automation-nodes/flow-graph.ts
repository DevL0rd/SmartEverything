import { defineNodeKind, type NodeKind } from './define';

const start = defineNodeKind({
  id: 'flow.start',
  name: 'Start',
  category: 'flow',
  icon: 'play',
  class: 'control',
  description:
    'Where every run begins. Its values are the inputs of the program and its only exit is Then.',
  inputs: [],
  outputs: [],
  exits: ['next'],
  structural: true,
  summary: 'Start',
  keywords: [],
  access: 'member',
  tier: 'later',
});

const onFailure = defineNodeKind({
  id: 'flow.on_failure',
  name: 'On failure',
  category: 'flow',
  icon: 'triangle-alert',
  class: 'control',
  description:
    'Where the failure handler of an automation begins. It runs when the run ends as failed.',
  inputs: [],
  outputs: [],
  exits: ['next'],
  structural: true,
  summary: 'On failure',
  keywords: [],
  access: 'member',
  tier: 'later',
});

const join = defineNodeKind({
  id: 'flow.join',
  name: 'Wait for all',
  category: 'flow',
  icon: 'git-merge',
  class: 'control',
  description:
    'Where the paths of one Do together meet again. The run carries on along Then once they have finished.',
  inputs: [],
  outputs: [],
  exits: ['next'],
  structural: true,
  summary: 'Wait for all',
  keywords: [],
  access: 'member',
  tier: 'later',
});

export const FLOW_GRAPH_KINDS: readonly NodeKind[] = [start, onFailure, join];
