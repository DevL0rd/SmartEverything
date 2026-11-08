import { PLUGIN_TOOL_SEPARATOR, type ChatTimelineTool } from '@smarteverything/domain';
import { toolDisplayName } from './tool-names';
import {
  fileLabel,
  readableToolLine,
  reportedLine,
  reportedRecord,
  toolKey,
} from './tool-presentation-text';
import { mcpToolVerb } from './tool-verbs';

interface ToolAction {
  readonly title: string;
  readonly verb: string;
  readonly fileVerb?: string;
}
const ACTIONS: ReadonlyMap<string, ToolAction> = new Map([
  ['bash', { title: 'Run a command', verb: 'run commands' }],
  ['pwsh', { title: 'Run a command', verb: 'run commands' }],
  ['exec_command', { title: 'Run a command', verb: 'run commands' }],
  ['shell', { title: 'Run a command', verb: 'run commands' }],
  ['read', { title: 'Read a file', verb: 'read files', fileVerb: 'Read' }],
  ['read_file', { title: 'Read a file', verb: 'read files', fileVerb: 'Read' }],
  ['write', { title: 'Write a file', verb: 'edit files', fileVerb: 'Write' }],
  ['write_file', { title: 'Write a file', verb: 'edit files', fileVerb: 'Write' }],
  ['edit', { title: 'Edit a file', verb: 'edit files', fileVerb: 'Edit' }],
  ['edit_file', { title: 'Edit a file', verb: 'edit files', fileVerb: 'Edit' }],
  ['apply_patch', { title: 'Update files', verb: 'edit files' }],
  ['grep', { title: 'Search file contents', verb: 'search files' }],
  ['glob', { title: 'Find files', verb: 'search files' }],
  ['home_read', { title: 'Read the home’s rooms and devices', verb: 'read the home' }],
  ['device_control', { title: 'Change device settings', verb: 'control devices' }],
  ['image_gen', { title: 'Make an image', verb: 'make images' }],
  ['web_search', { title: 'Search the web', verb: 'search the web' }],
  ['search_web', { title: 'Search the web', verb: 'search the web' }],
  ['websearch', { title: 'Search the web', verb: 'search the web' }],
  ['web_fetch', { title: 'Read a web page', verb: 'read web pages' }],
  ['webfetch', { title: 'Read a web page', verb: 'read web pages' }],
  ['web_run', { title: 'Browse the web', verb: 'browse the web' }],
  ['ask_user_question', { title: 'Ask for your input', verb: 'ask for input' }],
]);

interface CommandGoal {
  readonly pattern: RegExp;
  readonly title: string;
  readonly verb: string;
}

const TOOL_PREFIX = String.raw`^\s*(?:(?:pnpm|npm|yarn|bun)\s+(?:exec\s+|run\s+)?)?`;

function toolCommand(tools: string, title: string, verb: string): CommandGoal {
  return { pattern: new RegExp(`${TOOL_PREFIX}(?:${tools})\\b`), title, verb };
}

const COMMAND_GOALS: readonly CommandGoal[] = [
  toolCommand('eslint|lint', 'Check code style', 'check code'),
  toolCommand('tsc|typecheck', 'Check code types', 'check code'),
  toolCommand('prettier', 'Check formatting', 'check code'),
  toolCommand('test|vitest|pytest', 'Run checks', 'run checks'),
  toolCommand('build|bundle', 'Build the app', 'build the app'),
  { pattern: /^\s*(?:cat|head|tail|sed)\b/, title: 'Read file contents', verb: 'read files' },
  { pattern: /^\s*(?:rg|grep|find)\b/, title: 'Search files', verb: 'search files' },
  {
    pattern: /^\s*(?:ls|pwd)\b/,
    title: 'Inspect the working folder',
    verb: 'inspect the workspace',
  },
  {
    pattern: /^\s*git\s+(?:status|diff|log)\b/,
    title: 'Inspect code changes',
    verb: 'inspect the workspace',
  },
];

function commandOf(input: Readonly<Record<string, unknown>> | null): string | null {
  const command = input?.['command'] ?? input?.['cmd'];
  return typeof command === 'string' ? command : null;
}

function commandTitle(input: Readonly<Record<string, unknown>> | null): string | null {
  if (input === null) return null;
  const description = reportedLine(input, ['description', 'title']);
  if (description !== null) return description;
  const command = commandOf(input);
  if (command === null) return null;
  const known = COMMAND_GOALS.find((goal) => goal.pattern.test(command));
  if (known !== undefined) return known.title;
  const program = /^\s*([a-z][a-z0-9.-]*)\b/i.exec(command)?.[1];
  return program === undefined ? null : `Run ${program}`;
}

export function toolActionTitle(
  tool: ChatTimelineTool,
  pluginName: (id: string) => string | null,
): string {
  const title = readableToolLine(tool.title);
  if (title !== null && tool.title !== tool.name) return title;
  const action = ACTIONS.get(toolKey(tool.name));
  if (action !== undefined) return actionTitle(action, inputRecord(tool));
  return fallbackTitle(tool.name, pluginName);
}

const INPUTS = new WeakMap<ChatTimelineTool, Readonly<Record<string, unknown>> | null>();

function inputRecord(tool: ChatTimelineTool): Readonly<Record<string, unknown>> | null {
  const known = INPUTS.get(tool);
  if (known !== undefined) return known;
  const record = reportedRecord(tool.input);
  INPUTS.set(tool, record);
  return record;
}

function fallbackTitle(name: string, pluginName: (id: string) => string | null): string {
  const separator = name.indexOf(PLUGIN_TOOL_SEPARATOR);
  const plugin = separator < 0 ? null : pluginName(name.slice(0, separator));
  const words = toolKey(name);
  const action =
    words.replaceAll('_', '').trim() === ''
      ? 'Requested action'
      : toolDisplayName(words, pluginName);
  return plugin === null ? action : `${plugin}: ${action}`;
}

function actionTitle(action: ToolAction, input: Readonly<Record<string, unknown>> | null): string {
  if (action.title === 'Run a command') return commandTitle(input) ?? action.title;
  const file = fileLabel(input);
  return action.fileVerb !== undefined && file !== null
    ? `${action.fileVerb} ${file}`
    : action.title;
}

export function toolVerb(tool: ChatTimelineTool): string | null {
  const key = toolKey(tool.name);
  const action = ACTIONS.get(key);
  if (action === undefined) return mcpToolVerb(key);
  if (action.title !== 'Run a command') return action.verb;
  const command = commandOf(inputRecord(tool));
  const known =
    command === null ? undefined : COMMAND_GOALS.find((goal) => goal.pattern.test(command));
  return known?.verb ?? action.verb;
}
