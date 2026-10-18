import type { Served } from './served-types';

export const SERVED_AUTOMATIONS = [
  [
    'list_automations',
    'automations',
    'read',
    'List automations',
    'Every automation with its revision, when (triggers), onlyIf, steps and inputs, whether it is on, last run, run count, last error and who made it (author: a person or the assistant, plugin origin; null when made before this was recorded). One with no triggers is reusable steps that run_automation or another automation starts.',
    { part: 'list_automations' },
  ],
  [
    'edit_automation',
    'automations',
    'control',
    'Edit automations',
    'Adds, changes, switches on or off, or removes an automation: when (triggers), onlyIf (one condition) and steps; a tool step calls any enabled tool with its exact arguments from tool_details, such as speak on a camera speaker. automationId and revision come from list_automations; deviceId and control keys from get_device; signal kinds and match keys from read_signals; speech sources from list_speech_sources.',
    {
      key: 'action',
      parts: {
        create: 'create_automation',
        update: 'update_automation',
        remove: 'remove_automation',
      },
    },
  ],
  [
    'run_automation',
    'automations',
    'control',
    'Run an automation',
    'Runs an automation’s steps now, skipping its triggers and onlyIf, and really performs them. automationId comes from list_automations; pass inputs for one that declares them and wait to get the finished run.',
    { part: 'run_automation' },
  ],
  [
    'stop_automation',
    'automations',
    'control',
    'Stop automation runs',
    'Stops one run (runId from read_automation_runs) or every active and queued run of an automation, optionally only those with one key. Commands already sent may still finish.',
    {
      key: 'action',
      parts: { run: 'stop_automation_run', automation: 'stop_automation_runs' },
      says: {
        run: 'Cancel one run so its later steps do not happen',
        automation:
          'Stop every active and queued run of an automation, optionally only those with one key',
      },
    },
  ],
  [
    'read_automation_runs',
    'automations',
    'read',
    'Read automation runs',
    'Run history: the newest runs, optionally of one automation, or one run with its status, step outcomes and linked command ids.',
    {
      key: 'view',
      parts: { list: 'list_automation_runs', run: 'read_automation_run' },
      says: {
        list: 'The newest 200 runs, optionally of one automation',
        run: 'One run with its status and what each step did',
      },
    },
  ],
  [
    'list_values',
    'automations',
    'read',
    'List Values',
    'The home’s Values (on/off, number, duration or choice) that automations read and change, with their revisions.',
    { part: 'list_automation_values' },
  ],
  [
    'edit_value',
    'automations',
    'control',
    'Edit a Value',
    'Creates, replaces or removes a Value, or applies one atomic operation to it (set, toggle, add, subtract, next, previous). valueId and revision come from list_values.',
    {
      key: 'action',
      parts: {
        create: 'create_automation_value',
        update: 'update_automation_value',
        remove: 'remove_automation_value',
        apply: 'apply_automation_value_operation',
      },
      says: {
        create: 'Create a Value (on/off, number, duration or choice) with its limits',
        update:
          'Replace a Value’s definition and current value; send expectedRevision to refuse the save if it changed since you read it',
        remove: 'Delete a Value that no automation uses',
        apply: 'Set, toggle, add, subtract or step a Value in one atomic operation',
      },
    },
  ],
] as const satisfies readonly Served[];
