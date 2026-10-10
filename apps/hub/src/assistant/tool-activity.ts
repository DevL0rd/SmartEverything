type Field = (key: string) => string;

function fileName(field: Field, ...keys: readonly string[]): string {
  const path = keys.map(field).find((value) => value !== '') ?? '';
  return path.split('/').pop() ?? '';
}

function helper(field: Field): string {
  return field('description') || 'Starting a helper agent';
}

function editing(field: Field): string {
  return `Editing ${fileName(field, 'file_path', 'notebook_path')}`;
}

const FRIENDLY: Readonly<Record<string, (field: Field) => string>> = {
  Bash: (field) => field('description') || 'Running a command',
  Edit: editing,
  Write: editing,
  NotebookEdit: editing,
  Read: (field) => `Reading ${fileName(field, 'file_path')}`,
  WebSearch: (field) => `Searching the web for “${field('query')}”`,
  Grep: (field) =>
    field('pattern') === ''
      ? 'Searching files'
      : `Searching files for “${field('pattern').slice(0, 60)}”`,
  Glob: () => 'Finding files',
  WebFetch: () => 'Reading a web page',
  Agent: helper,
  Task: helper,
  Monitor: () => 'Watching for a result',
  Skill: () => 'Loading a skill',
};

export function activityLine(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function toolLabel(name: string): string {
  const last =
    name
      .replace(/^mcp__/, '')
      .replace(/^plugin_[^_]+_/, '')
      .split('__')
      .at(-1) ?? '';
  const words = last
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return `Using ${words === '' ? 'a tool' : words}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toolActivity(name: string, input: unknown): string {
  const fields = isRecord(input) ? input : {};
  const field: Field = (key) => {
    const value = fields[key];
    return typeof value === 'string' ? value : '';
  };
  const friendly = FRIENDLY[name];
  return activityLine(friendly === undefined ? toolLabel(name) : friendly(field));
}
