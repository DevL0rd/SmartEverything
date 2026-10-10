import { SECRET_PATH, commandReasons } from './safe-command';
import { folderOf, realTarget, type Folder } from './safe-path';
import { scanShell } from './shell-words';

export interface RiskInput {
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly cwd: string | null;
}

export interface Risk {
  readonly risk: 'safe' | 'risky';
  readonly reasons: readonly string[];
}

const SAFE: Risk = { risk: 'safe', reasons: [] };

function risky(...reasons: string[]): Risk {
  return { risk: 'risky', reasons };
}

const SYSTEM_WRITE =
  /(^|\/)(\.git\/(hooks|config)|\.git$|\.claude(\/|$)|\.bashrc|\.zshrc|\.profile|\.zprofile|\.bash_profile|authorized_keys|\.gitattributes|\.envrc)/;

const READ_TOOLS: Readonly<Record<string, readonly string[]>> = {
  Read: ['file_path'],
  Glob: ['pattern', 'path'],
  Grep: ['path', 'glob'],
  LS: ['path'],
  NotebookRead: ['notebook_path'],
};

const WRITE_TOOLS: Readonly<Record<string, readonly string[]>> = {
  Edit: ['file_path'],
  Write: ['file_path'],
  MultiEdit: ['file_path'],
  NotebookEdit: ['notebook_path'],
};

const NO_PATH_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet']);

const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch']);

function stringOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function pathReasons(path: string, folder: Folder | null, writing: boolean): string[] {
  const real = folder === null ? null : realTarget(path, folder);
  const reasons: string[] = [];
  if (SECRET_PATH.test(path) || (real !== null && SECRET_PATH.test(real))) {
    reasons.push(`touches a secrets path (${path})`);
  }
  if (real === null) {
    reasons.push(
      `${writing ? 'writes' : 'reads'} outside the session folder or a path that cannot be resolved (${path})`,
    );
  } else if (writing && (SYSTEM_WRITE.test(path) || SYSTEM_WRITE.test(real))) {
    reasons.push(`writes a configuration or hook file (${path})`);
  }
  return reasons;
}

function fileRisk(
  fields: readonly string[],
  input: Readonly<Record<string, unknown>>,
  cwd: string | null,
  writing: boolean,
): Risk {
  const paths = fields.flatMap((field) => {
    const value = stringOf(input[field]);
    return value === null ? [] : [value];
  });
  if (writing && paths.length === 0) {
    return risky('names no file to write');
  }
  const folder = folderOf(cwd);
  if (paths.length > 0 && folder === null) {
    return risky('the session folder is unknown or too broad to judge the path');
  }
  const reasons = paths.flatMap((path) => pathReasons(path, folder, writing));
  return reasons.length === 0 ? SAFE : risky(...reasons);
}

function bashRisk(command: string, cwd: string | null): Risk {
  const scan = scanShell(command);
  if (scan.unsafe !== null) {
    return risky(scan.unsafe);
  }
  if (scan.commands.length === 0) {
    return risky('has no command');
  }
  const folder = folderOf(cwd);
  const reasons = scan.commands.flatMap((words) => commandReasons(words, folder));
  return reasons.length === 0 ? SAFE : risky(...new Set(reasons));
}

function toolRisk(request: RiskInput): Risk {
  const { toolName, input, cwd } = request;
  const reading = Object.hasOwn(READ_TOOLS, toolName) ? READ_TOOLS[toolName] : undefined;
  const writing = Object.hasOwn(WRITE_TOOLS, toolName) ? WRITE_TOOLS[toolName] : undefined;
  if (reading !== undefined) {
    return fileRisk(reading, input, cwd, false);
  }
  if (writing !== undefined) {
    return fileRisk(writing, input, cwd, true);
  }
  if (NO_PATH_TOOLS.has(toolName)) {
    return SAFE;
  }
  if (toolName.startsWith('mcp__')) {
    return risky(`runs a tool of another MCP server (${toolName})`);
  }
  if (NETWORK_TOOLS.has(toolName)) {
    return risky(`reaches the network (${toolName})`);
  }
  return risky(`${toolName} is not a tool this check knows`);
}

export function classifyPrompt(request: RiskInput): Risk {
  const { toolName, input, cwd } = request;
  if (toolName === 'AskUserQuestion') {
    return SAFE;
  }
  if (toolName === 'ExitPlanMode') {
    return risky('approving the plan lets the session start changing things');
  }
  if (toolName === 'Bash') {
    const command = stringOf(input['command']);
    return command === null ? risky('has no command') : bashRisk(command, cwd);
  }
  return toolRisk(request);
}
