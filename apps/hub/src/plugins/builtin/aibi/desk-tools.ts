import type { PluginAssistant } from '../contract';
import { ASSISTANT_COMMANDS, assistantCommand } from './assistant-commands';
import { checkAction, enabledActions, type Abilities, type Params } from './catalogue';
import type { DeskAnswer, DeskTool } from './conversation-types';
import { actionToolDescription } from './place-instructions';
import { messageOf } from '@smarteverything/logging';

export interface DeskToolHost {
  readonly abilities: () => Abilities;
  readonly acted: (id: string, params: Params) => void;
  readonly task: (text: string, quick: boolean) => DeskAnswer;
  readonly assistant: PluginAssistant;
}

class ActionOptionsError extends Error {
  override readonly name = 'ActionOptionsError';

  constructor(readonly received: string) {
    super('options must be a JSON object such as {"mode":"rainbow"}; use {} when there are none');
  }
}

function optionsOf(text: string | undefined): Readonly<Record<string, unknown>> {
  if (text === undefined || text.trim() === '') {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw new ActionOptionsError(text);
    }
    throw cause;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ActionOptionsError(text);
  }
  return Object.fromEntries(Object.entries(parsed));
}

function describedAction(id: string, params: Params): string {
  return `AIBI did ${id}${Object.keys(params).length > 0 ? ` ${JSON.stringify(params)}` : ''}.`;
}

function settled(work: Promise<string>): Promise<DeskAnswer> {
  return work.then(
    (status): DeskAnswer => ({ result: { status } }),
    (error: unknown): DeskAnswer => ({
      result: { error: messageOf(error) },
    }),
  );
}

function actionTool(host: DeskToolHost): DeskTool {
  const ids = enabledActions(host.abilities()).map((action) => action.id);
  return {
    name: 'aibi_action',
    description: actionToolDescription(host.abilities()),
    parameters: {
      action: { description: 'The native action to perform.', required: true, choices: ids },
      options: {
        description:
          'JSON object with the options for that action, such as {"mode":"rainbow","control":"on"}. Use {} when none.',
        required: false,
      },
    },
    delivery: 'silent',
    answer: (args): DeskAnswer => {
      const { action, params } = checkAction(
        host.abilities(),
        args['action'] ?? '',
        optionsOf(args['options']),
      );
      host.acted(action.id, params);
      return {
        outcome: { kind: 'action', behavior: action.id, params },
        result: { status: 'doing it now' },
        line: describedAction(action.id, params),
      };
    },
  };
}

function taskTool(host: DeskToolHost): DeskTool {
  return {
    name: 'do_task',
    description:
      'Do something beyond conversation and your robot body: computer work, messages, files, code, research, looking things up. It runs in the background; results come back to you as [Task update] notes.',
    parameters: {
      task: {
        description:
          'What to do, in full, with every name, detail and preference they gave, in their own words.',
        required: true,
      },
      quick: {
        description:
          'yes when it should be done in a few steps, like opening or closing an app: you stay on this reply, can say short updates, and tell them the result when it arrives, without starting a conversation.',
        required: false,
        choices: ['yes', 'no'],
      },
    },
    delivery: 'idle',
    answer: (args): DeskAnswer => host.task((args['task'] ?? '').trim(), args['quick'] === 'yes'),
  };
}

function assistantTool(host: DeskToolHost): DeskTool {
  return {
    name: 'assistant',
    description:
      'Control the AI that does your computer work: its status, plan usage left, compacting its memory, starting fresh, stopping what it is doing, or switching its model. Tell them the result in your own words.',
    parameters: {
      command: { description: 'What to do.', required: true, choices: ASSISTANT_COMMANDS },
      model: {
        description: 'For model: the model id, or default.',
        required: false,
      },
    },
    delivery: 'idle',
    answer: (args) =>
      settled(assistantCommand(host.assistant, args['command'] ?? '', args['model'] ?? '')),
  };
}

export function deskTools(host: DeskToolHost): readonly DeskTool[] {
  return [
    actionTool(host),
    {
      name: 'look',
      description:
        'Take a photo with your camera to see what they are showing you. Say nothing in the same turn.',
      parameters: {},
      delivery: 'silent',
      answer: (): DeskAnswer => ({
        outcome: { kind: 'look' },
        result: { status: 'taking a photo; it arrives next' },
        line: 'Looked with its camera.',
      }),
    },
    taskTool(host),
    assistantTool(host),
    {
      name: 'end_conversation',
      description: 'End this conversation.',
      parameters: {},
      delivery: 'silent',
      answer: (): DeskAnswer => ({ end: true, result: { status: 'ending after this turn' } }),
    },
  ];
}
