import type { ModelSpecCondition } from '@smarteverything/domain';

export const SHAKE_SHOT_WHEN: ModelSpecCondition = {
  anyOf: [
    { allOf: [{ signal: 'motion', op: 'eq', value: true }] },
    { allOf: [{ signal: 'alarm', op: 'eq', value: true }] },
  ],
};
