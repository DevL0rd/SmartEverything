import type { PluginAssistant } from '../contract';

export const ROBOT_CONVERSATION = 'robot';

export const ASSISTANT_COMMANDS = ['status', 'usage', 'compact', 'new', 'stop', 'model'] as const;

const MICROS_PER_DOLLAR = 1_000_000;
const DEFAULT_MODEL = 'default';

class AssistantCommandError extends Error {
  override readonly name = 'AssistantCommandError';

  constructor(readonly command: string) {
    super(`${command} is not one of ${ASSISTANT_COMMANDS.join(', ')}`);
  }
}

function dollars(micros: number): string {
  return `$${(micros / MICROS_PER_DOLLAR).toFixed(2)}`;
}

function usageLine(
  label: string,
  span: { readonly costMicros: number; readonly calls: number },
): string {
  return `${label} ${dollars(span.costMicros)} in ${String(span.calls)} calls`;
}

function statusOf(assistant: PluginAssistant): string {
  const conversation = assistant.conversation(ROBOT_CONVERSATION);
  if (conversation === null) {
    return 'Nothing has been asked yet.';
  }
  const reason = conversation.reason === null ? '' : ` (${conversation.reason})`;
  return `${conversation.state}${reason}; model ${conversation.model ?? DEFAULT_MODEL}; ${dollars(conversation.costMicros)} spent on this conversation`;
}

function usageOf(assistant: PluginAssistant): string {
  const { today, week, month } = assistant.usage();
  return [
    usageLine('Today', today),
    usageLine('this week', week),
    usageLine('this month', month),
  ].join(', ');
}

type Handler = (assistant: PluginAssistant, value: string) => Promise<string>;

async function compacted(assistant: PluginAssistant): Promise<string> {
  return (await assistant.compact(ROBOT_CONVERSATION))
    ? 'Its memory was compacted.'
    : 'There was nothing to compact.';
}

async function restarted(assistant: PluginAssistant): Promise<string> {
  return (await assistant.startOver(ROBOT_CONVERSATION))
    ? 'Starting fresh with the next request.'
    : 'There was no conversation to start over.';
}

async function stopped(assistant: PluginAssistant): Promise<string> {
  return (await assistant.stop(ROBOT_CONVERSATION))
    ? 'Stopped what it was doing.'
    : 'Nothing was running.';
}

async function switched(assistant: PluginAssistant, value: string): Promise<string> {
  const choice = value === '' || value === DEFAULT_MODEL ? null : value;
  const name = await assistant.setModel(ROBOT_CONVERSATION, choice);
  return `The model is now ${name ?? DEFAULT_MODEL}.`;
}

const HANDLERS: Readonly<Record<(typeof ASSISTANT_COMMANDS)[number], Handler>> = {
  status: (assistant) => Promise.resolve(statusOf(assistant)),
  usage: (assistant) => Promise.resolve(usageOf(assistant)),
  compact: compacted,
  new: restarted,
  stop: stopped,
  model: switched,
};

function isCommand(name: string): name is (typeof ASSISTANT_COMMANDS)[number] {
  return ASSISTANT_COMMANDS.some((command) => command === name);
}

export function assistantCommand(
  assistant: PluginAssistant,
  command: string,
  value: string,
): Promise<string> {
  if (!isCommand(command)) {
    return Promise.reject(new AssistantCommandError(command));
  }
  return HANDLERS[command](assistant, value);
}
