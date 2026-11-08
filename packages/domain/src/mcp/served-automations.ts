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
      'One-off steps for later (a timing and steps such as a tool call, a wait or an AI wake that continues this chat): create, change, cancel, run now or remove; scheduleId comes from schedule_find. Not for timers, alarms or reminders for a person (planner_edit) and not for anything that repeats or reacts to events (automation_edit).',
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
      'Reads automations and Custom Nodes: summary lists them with revision, trigger summary, last run and last error; full and outline return one program; functions lists Custom Nodes; catalog lists every node kind with ports, picker sources, run modes, whether it has an If it fails exit and, for plugin nodes, the plugin and availability, read it before writing a program; secrets lists secret names (owner only); revisions, revision, compare and draft read the history and the editor working copy. Not for runs (automation_runs_read).',
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
          line: 'Node kinds with ports, picker sources, run modes, error exit and plugin availability; filter by query, group or kind',
        },
        secrets: {
          part: 'list_automation_secrets',
          line: 'Secret names, dates and the automations using them; owner only',
        },
        revisions: {
          part: 'list_automation_revisions',
          line: 'Published revisions of one automation, newest first, with date and author',
        },
        revision: {
          part: 'read_automation_revision',
          line: 'One published revision with its program and layout',
        },
        compare: {
          part: 'compare_automation_revisions',
          line: 'What differs between a revision and a later one or the draft, one row per part',
        },
        draft: {
          part: 'read_automation_draft',
          line: 'The working copy the person is editing, or the published program when none',
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
      'Writes automation and Custom Node programs made only of nodes and wires (every port holds {"lit": value} or a wire); read automation_read view catalog first and use its first-class and plugin nodes, tool.call only for assistant-only tools no node covers. check validates without saving; create, update and patch write an automation, update also switches it on or off or renames it; create_node, save_node and remove_node write a Custom Node. Its description is one short line: what starts it and what it does. Then automation_run mode dry. Not for running one (automation_run).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_automation', line: 'Add an automation from a full program' },
        update: {
          part: 'update_automation',
          line: 'Replace an automation program as the next revision, switch it on or off with enabled, or rename it with name',
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
    name: 'automation_versions_edit',
    area: 'automations',
    access: 'control',
    title: 'Restore and publish versions',
    line: 'Restore a revision, publish or discard a draft',
    description:
      'Works with the versions of one automation: restore makes an earlier revision (automation_read view revisions) the next published revision; publish puts the draft the person saved in the editor live after the full check; discard throws that draft away. Not for writing a program (automation_edit).',
    route: {
      key: 'action',
      branches: {
        restore: {
          part: 'restore_automation_revision',
          line: 'Publish an earlier revision again as the next revision, with its layout',
        },
        publish: { part: 'publish_automation_draft', line: 'Publish the saved editor draft' },
        discard: { part: 'discard_automation_draft', line: 'Throw the saved editor draft away' },
      },
    },
  },
  {
    name: 'automation_tests_edit',
    area: 'automations',
    access: 'control',
    title: 'Edit automation tests',
    line: 'Stored simulations and what they must produce',
    description:
      'Stored tests of one automation, the same as the Test panel in the editor: a simulation scenario plus what it must produce. create and save write one, remove deletes one, run runs every stored test on a virtual clock without sending anything and returns each pass or failure. Read them with automation_runs_read view tests.',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_automation_test', line: 'Store a new test scenario' },
        save: { part: 'save_automation_test', line: 'Replace a stored test' },
        remove: { part: 'remove_automation_test', line: 'Delete a stored test' },
        run: { part: 'run_automation_tests', line: 'Run every stored test and report each result' },
      },
    },
  },
  {
    name: 'custom_node_edit',
    area: 'automations',
    access: 'control',
    title: 'Make and update Custom Node uses',
    line: 'Turn steps into a Custom Node, move callers on',
    description:
      'Reshapes Custom Node uses: extract turns chosen steps of an automation into a new Custom Node and puts one call to it in their place, in one change; move_callers moves every automation and Custom Node that follows a Custom Node onto its latest revision with a mapping for renamed or new ports. Creating, saving and removing a Custom Node is automation_edit.',
    route: {
      key: 'action',
      branches: {
        extract: {
          part: 'extract_custom_node',
          line: 'Move chosen steps into a new Custom Node and call it in their place',
        },
        move_callers: {
          part: 'update_custom_node_callers',
          line: 'Move every caller onto the latest revision with a port mapping',
        },
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
      'Run history of automations: the newest runs, one run with what each node did, node records of a run, why an automation did not run, the questions automations wait on with their buttons, and the stored tests of one automation. Use it to explain what an automation did.',
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
        tests: {
          part: 'list_automation_tests',
          line: 'Stored test scenarios of one automation with what each must produce',
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
