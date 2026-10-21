import { PLUGIN_TOOL_SEPARATOR, type ChatTimelineTool } from '@smarteverything/domain';
import { toolDisplayName } from './tool-names';
import {
  fileLabel,
  readableToolLine,
  reportedLine,
  reportedRecord,
  toolKey,
} from './tool-presentation-text';

interface ToolAction {
  readonly title: string;
  readonly goal: string;
  readonly fileVerb?: string;
}
const ACTIONS: ReadonlyMap<string, ToolAction> = new Map([
  ['bash', { title: 'Run a command', goal: 'Running commands' }],
  ['pwsh', { title: 'Run a command', goal: 'Running commands' }],
  ['exec_command', { title: 'Run a command', goal: 'Running commands' }],
  ['shell', { title: 'Run a command', goal: 'Running commands' }],
  ['read', { title: 'Read a file', goal: 'Reading files', fileVerb: 'Read' }],
  ['read_file', { title: 'Read a file', goal: 'Reading files', fileVerb: 'Read' }],
  ['write', { title: 'Write a file', goal: 'Updating files', fileVerb: 'Write' }],
  ['write_file', { title: 'Write a file', goal: 'Updating files', fileVerb: 'Write' }],
  ['edit', { title: 'Edit a file', goal: 'Updating files', fileVerb: 'Edit' }],
  ['edit_file', { title: 'Edit a file', goal: 'Updating files', fileVerb: 'Edit' }],
  ['apply_patch', { title: 'Update files', goal: 'Updating files' }],
  ['grep', { title: 'Search file contents', goal: 'Searching files' }],
  ['glob', { title: 'Find files', goal: 'Searching files' }],
  ['home_read', { title: 'Read the home’s rooms and devices', goal: 'Checking devices' }],
  ['device_control', { title: 'Change device settings', goal: 'Updating devices' }],
  ['image_gen', { title: 'Make an image', goal: 'Working with images' }],
  ['web_search', { title: 'Search the web', goal: 'Searching the web' }],
  ['search_web', { title: 'Search the web', goal: 'Searching the web' }],
  ['websearch', { title: 'Search the web', goal: 'Searching the web' }],
  ['web_run', { title: 'Browse the web', goal: 'Browsing the web' }],
  ['ask_user_question', { title: 'Ask for your input', goal: 'Getting your input' }],
]);
const COMMAND_GOALS: readonly (readonly [RegExp, string])[] = [
  [/^\s*(?:(?:pnpm|npm|yarn|bun)\s+(?:exec\s+|run\s+)?)?(?:eslint|lint)\b/, 'Check code style'],
  [/^\s*(?:(?:pnpm|npm|yarn|bun)\s+(?:exec\s+|run\s+)?)?(?:tsc|typecheck)\b/, 'Check code types'],
  [/^\s*(?:(?:pnpm|npm|yarn|bun)\s+(?:exec\s+|run\s+)?)?prettier\b/, 'Check formatting'],
  [/^\s*(?:(?:pnpm|npm|yarn|bun)\s+(?:exec\s+|run\s+)?)?(?:test|vitest|pytest)\b/, 'Run checks'],
  [/^\s*(?:(?:pnpm|npm|yarn|bun)\s+(?:exec\s+|run\s+)?)?(?:build|bundle)\b/, 'Build the app'],
  [/^\s*(?:cat|head|tail|sed)\b/, 'Read file contents'],
  [/^\s*(?:rg|grep|find)\b/, 'Search files'],
  [/^\s*(?:ls|pwd)\b/, 'Inspect the working folder'],
  [/^\s*git\s+(?:status|diff|log)\b/, 'Inspect code changes'],
];

function commandTitle(input: Readonly<Record<string, unknown>> | null): string | null {
  if (input === null) return null;
  const description = reportedLine(input, ['description', 'title']);
  if (description !== null) return description;
  const command = input['command'] ?? input['cmd'];
  if (typeof command !== 'string') return null;
  const known = COMMAND_GOALS.find(([pattern]) => pattern.test(command));
  if (known !== undefined) return known[1];
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

export function toolActivityGoal(tool: ChatTimelineTool): string | null {
  return ACTIONS.get(toolKey(tool.name))?.goal ?? null;
}
