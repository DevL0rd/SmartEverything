import type { Served } from './served-types';

export const SERVED_AUTOMATIONS = [
  {
    name: 'scene_find',
    area: 'automations',
    access: 'read',
    title: 'Find scenes',
    line: 'Scenes with their actions',
    description:
      'Lists scenes in order with their actions, filtered by words in the name; a partial list carries the total and nextCursor. Read it before scene_run or scene_edit for the sceneId.',
    route: { part: 'scene_find' },
  },
  {
    name: 'scene_edit',
    area: 'automations',
    access: 'control',
    title: 'Edit scenes',
    line: 'Add, change or remove',
    description:
      'Adds, changes or removes a scene; sceneId comes from scene_find and each action needs deviceId and capability from device_read. Not for running one (scene_run).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_scene', line: 'Add a scene from a name, icon and actions' },
        update: { part: 'update_scene', line: 'Change a scene’s name, icon, actions or position' },
        remove: { part: 'remove_scene', line: 'Remove a scene' },
      },
    },
  },
  {
    name: 'schedule_find',
    area: 'automations',
    access: 'read',
    title: 'Find scheduled steps',
    line: 'What waits to run, and how it went',
    description:
      'Lists one-off scheduled actions soonest first with each step’s result, optionally of one device or state. Read it for the scheduleId schedule_edit takes.',
    route: { part: 'schedule_find' },
  },
  {
    name: 'schedule_edit',
    area: 'automations',
    access: 'control',
    title: 'Schedule steps',
    line: 'Plan steps for later, change or cancel them',
    description:
      'One-off steps for later (a timing and steps such as a tool call, a wait or an AI wake that continues this chat): create, change, cancel, run now or remove; scheduleId comes from schedule_find. Use it for timers and reminders. Not for anything that repeats or reacts to events (automation_edit).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'schedule_actions', line: 'Plan steps for a time or a delay' },
        update: { part: 'update_scheduled', line: 'Change the label, timing or steps' },
        cancel: { part: 'cancel_scheduled', line: 'Cancel a waiting schedule, kept in the list' },
        run: { part: 'run_scheduled', line: 'Run a waiting schedule now' },
        remove: { part: 'remove_scheduled', line: 'Delete a schedule from the list' },
      },
    },
  },
  {
    name: 'signal_read',
    area: 'automations',
    access: 'read',
    title: 'Read signals',
    line: 'Everything an automation can react to',
    description:
      'What automations can trigger on: view catalogue searches every trigger by words (a device, room, plugin or what it does) with how to use it, start there; kinds lists signal kinds with their match keys; values reads the newest signal values; speech_sources lists what a speech phrase trigger can listen to. A match key with null values takes any value seen.',
    route: {
      key: 'view',
      branches: {
        catalogue: {
          part: 'list_trigger_catalogue',
          line: 'Triggers matching words or a group, with field, match keys and a sentence',
        },
        kinds: {
          part: 'list_signal_kinds',
          line: 'Signal kinds with match keys, feed, urgent and opt-in flags',
        },
        values: { part: 'read_signal', line: 'The newest values of one signal' },
        speech_sources: {
          part: 'list_speech_sources',
          line: 'Sources a literal speech phrase trigger can listen to',
        },
      },
    },
  },
  {
    name: 'automation_read',
    area: 'automations',
    access: 'read',
    title: 'Read automations',
    line: 'Automations, programs, nodes, catalog',
    description:
      'Reads automations and Custom Nodes: summary lists them with revision, trigger summary, last run and last error; full and outline return one program; functions lists Custom Nodes; catalog lists node kinds with ports and examples, read it before writing a program; secrets lists secret names and users, never values (owner only). Not for runs (automation_runs_read).',
    route: {
      key: 'view',
      branches: {
        summary: {
          part: 'automation_read',
          line: 'Automations with revision, trigger summary, node count, last run and last error',
        },
        full: { part: 'read_automation', line: 'One program as stored, without layout' },
        outline: {
          part: 'read_automation_outline',
          line: 'One program as one keyed line per node, indented by scope',
        },
        function: {
          part: 'read_custom_node',
          line: 'One Custom Node program with its interface and revision',
        },
        functions: {
          part: 'list_automation_functions',
          line: 'Custom Nodes with interface, revision and users',
        },
        catalog: {
          part: 'list_automation_catalog',
          line: 'Node kinds with ports, types and examples; filter by query, group or kind',
        },
        secrets: {
          part: 'list_automation_secrets',
          line: 'Secret names, dates and the automations using them; owner only',
        },
      },
    },
  },
  {
    name: 'automation_edit',
    area: 'automations',
    access: 'control',
    title: 'Edit automations',
    line: 'Write, check or remove automations and Custom Nodes',
    description:
      'Writes automation and Custom Node programs built only from nodes and wires (every port holds {"lit": value} or a wire); read automation_read view catalog first. check validates without saving; create, update and patch write an automation, update also switches one on or off; create_node, save_node and remove_node write a Custom Node. Replies name node, port, expected, received and a fix. Then automation_run mode dry. Not for running one (automation_run).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_automation', line: 'Add an automation from a full program' },
        update: {
          part: 'update_automation',
          line: 'Replace an automation program as the next revision, or switch it on or off with enabled',
        },
        patch: {
          part: 'patch_automation',
          line: 'Apply ordered operations to a stored automation as one revision',
        },
        check: {
          part: 'check_automation',
          line: 'Validate a program, or a patch preview (automationId with ops); nothing is saved',
        },
        remove: { part: 'remove_automation', line: 'Delete an automation' },
        create_node: { part: 'create_custom_node', line: 'Add a Custom Node from a full program' },
        save_node: {
          part: 'save_custom_node',
          line: 'Save a Custom Node’s next revision; callers keep their last compatible revision',
        },
        remove_node: { part: 'remove_custom_node', line: 'Delete a Custom Node nothing uses' },
      },
    },
  },
  {
    name: 'secret_edit',
    area: 'automations',
    access: 'control',
    title: 'Edit secrets',
    line: 'Set or remove a write-only secret',
    description:
      'Stores a write-only secret value by name for automations to use, or removes one no automation uses; programs hold only its id. Owner only. The names and users are in automation_read view secrets.',
    route: {
      key: 'action',
      branches: {
        set: { part: 'set_automation_secret', line: 'Create or replace a secret by name' },
        remove: { part: 'remove_automation_secret', line: 'Remove a secret no automation uses' },
      },
    },
  },
  {
    name: 'automation_run',
    area: 'automations',
    access: 'control',
    title: 'Run an automation',
    line: 'Live, dry or simulated',
    description:
      'Starts an automation now: mode live performs its steps; dry records the commands it would send and every node value without sending; simulate runs a scenario on a virtual clock. trigger starts it as if one trigger fired, inputs feed one that declares them, wait returns its outputs. Returns the runId for automation_runs_read.',
    route: { part: 'automation_run' },
  },
  {
    name: 'automation_stop',
    area: 'automations',
    access: 'control',
    title: 'Stop automation runs',
    line: 'One run, or every run of an automation',
    description:
      'Stops one run (runId from automation_runs_read) or every active and queued run of an automation, optionally only those with one key. Commands already sent may still finish.',
    route: {
      key: 'action',
      branches: {
        run: {
          part: 'stop_automation_run',
          line: 'Cancel one run so its later steps do not happen',
        },
        automation: {
          part: 'stop_automation_runs',
          line: 'Stop every active and queued run of an automation',
        },
      },
    },
  },
  {
    name: 'automation_runs_read',
    area: 'automations',
    access: 'read',
    title: 'Read automation runs',
    line: 'Runs, node records, decisions, questions',
    description:
      'Run history of automations: the newest runs, one run with what each node did, node records of a run, why an automation did not run, and the questions automations wait on with their buttons. Use it to explain what an automation did.',
    route: {
      key: 'view',
      branches: {
        list: {
          part: 'list_automation_runs',
          line: 'The newest runs, optionally of one automation',
        },
        run: {
          part: 'read_automation_run',
          line: 'One run with its status and what each node did',
        },
        nodes: {
          part: 'read_automation_run_nodes',
          line: 'Node records of one run, paged; filter by node or iteration',
        },
        decisions: {
          part: 'list_automation_decisions',
          line: 'Why an automation did not run, per minute and reason',
        },
        questions: {
          part: 'list_automation_questions',
          line: 'Questions waiting for an answer, with buttons and who was asked',
        },
      },
    },
  },
  {
    name: 'automation_answer',
    area: 'automations',
    access: 'control',
    title: 'Answer an automation question',
    line: 'Press a button for a waiting question',
    description:
      'Presses one answer button for a question an automation is waiting on; questionId and buttons come from automation_runs_read view questions. Only the person asked, or the owner, can answer, and only with the button the person chose. The waiting run continues with it.',
    route: { part: 'automation_answer' },
  },
  {
    name: 'value_read',
    area: 'automations',
    access: 'read',
    title: 'Read Values',
    line: 'The switches and numbers automations share',
    description:
      'Lists the home’s Values (on/off, number, duration or choice) that automations read and change, with their current value and revision. Variables owned by one automation are in that program, not here.',
    route: { part: 'list_automation_values' },
  },
  {
    name: 'value_edit',
    area: 'automations',
    access: 'control',
    title: 'Edit a Value',
    line: 'Create, replace, remove or step',
    description:
      'Creates, replaces or removes a Value, or applies one atomic operation (set, toggle, add, subtract, next, previous) without reading it first; valueId comes from value_read. Returns the Value.',
    route: {
      key: 'action',
      branches: {
        create: {
          part: 'create_automation_value',
          line: 'Create a Value with its kind and limits',
        },
        update: {
          part: 'update_automation_value',
          line: 'Replace a Value’s definition and current value',
        },
        remove: { part: 'remove_automation_value', line: 'Delete a Value no automation uses' },
        apply: {
          part: 'apply_automation_value_operation',
          line: 'Set, toggle, add, subtract or step it atomically',
        },
      },
    },
  },
] as const satisfies readonly Served[];
