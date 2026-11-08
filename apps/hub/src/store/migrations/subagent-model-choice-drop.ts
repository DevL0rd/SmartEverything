import type { Migration } from './migration';

export const SUBAGENT_MODEL_CHOICE_DROP_MIGRATION: Migration = {
  version: 155,
  name: 'subagent-model-choice-drop',
  statements: [
    `update assistant_settings set settings = json_remove(settings, '$.agent_loops.subagents.model_choice') where json_type(settings, '$.agent_loops.subagents.model_choice') is not null`,
  ],
};
