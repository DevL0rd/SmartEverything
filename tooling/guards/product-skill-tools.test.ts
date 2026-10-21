import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { filesUnder, repositoryRoot as root } from './repository-files';

const ROUTE = z.union([
  z.object({ part: z.string() }),
  z.object({
    key: z.string(),
    branches: z.record(z.string(), z.object({ part: z.string(), line: z.string() })),
  }),
  z.object({ compose: z.array(z.string()) }),
  z.object({ custom: z.literal(true) }),
]);

const DOMAIN = z.object({
  MCP_TOOL_NAMES: z.array(z.string()),
  MCP_PART_NAMES: z.array(z.string()),
  MCP_OPERATION_TOOLS: z.array(z.tuple([z.string(), z.string()])),
  MCP_ROUTES: z.map(z.string(), ROUTE),
  MCP_TOOLS: z.array(z.object({ name: z.string(), description: z.string() })),
  MCP_TOOL_DOMAINS: z.array(z.string()),
  looksLikeMcpTool: z.custom<(word: string) => boolean>((value) => typeof value === 'function'),
});
const GUIDE = z.object({ TOOL_GUIDE: z.string() });
const INSTRUCTIONS = z.object({
  serverInstructions: z.custom<(enabled: readonly string[]) => string>(
    (value) => typeof value === 'function',
  ),
});
const HUB_TOOLS = z.object({
  TOOLS: z.array(z.object({ name: z.string(), listing: z.unknown() })),
});
const CATALOGUE = z.object({
  skills: z.array(z.object({ name: z.string(), description: z.string(), content: z.string() })),
});

const DESCRIPTION_MAX = 1024;
const BODY_MAX = 20_000;
const FRONT_MATTER = /^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n/u;

const OUTSIDE_NAMES = {
  dispatcher: ['tool_call'],
  nativeAgent: ['apply_patch'],
  nativeComputer: [
    'read_image',
    'set_working_directory',
  ],
  liveCall: ['conversation_end', 'sight_stop', 'task_start'],
  settingKey: ['claude_skills_enabled', 'call_audio', 'camera_notifications', 'health_sync'],
  capabilityKey: ['remote_control'],
  sharedSchema: [
    'automation_program',
    'custom_node_program',
    'automation_layout',
    'claude_cli_settings',
    'claude_settings',
    'codex_settings',
    'phone_action',
    'assistant_voice',
    'claude_cli_action',
    'claude_answer',
    'engine',
  ],
  fieldName: ['refresh_token', 'read_at', 'ai_defaults', 'person_id'],
  actionValue: [
    'set_member',
    'set_mode_order',
    'remove_member',
    'delete_message',
    'show_camera',
    'set_system_toggle',
    'set_secret',
    'remove_secret',
    'open_settings',
    'assign_reading',
    'speech_sources',
    'create_node',
    'save_node',
    'remove_node',
  ],
  fieldValue: ['open_food_facts'],
  pluginTool: ['save_profile'],
  settingsPage: ['write_settings'],
} as const;
const TOOL_LOOKING = /(?<![\w-])[a-z]+(?:_[a-z]+)+(?![\w-])/g;
const PROSE_ROOTS: readonly string[] = [
  'apps/hub/src/extensions/mcp',
  'apps/hub/src/ai-tools',
  'apps/hub/src/assistant-voice',
  'packages/domain/src',
  'apps/hub/src/plugins/builtin/adguard',
  'apps/hub/src/plugins/builtin/aibi',
  'apps/hub/src/plugins/builtin/discord',
  'apps/hub/src/plugins/builtin/openrgb',
  'apps/hub/src/plugins/builtin/shelly-presence',
  'apps/hub/src/plugins/builtin/wiz',
];

interface Names {
  readonly known: ReadonlySet<string>;
  readonly verbs: ReadonlySet<string>;
  readonly publicForm: ReadonlyMap<string, string>;
  readonly looksLikeTool: (word: string) => boolean;
}

function publicForms(domain: z.infer<typeof DOMAIN>): ReadonlyMap<string, string> {
  const forms = new Map<string, string>();
  for (const [tool, route] of domain.MCP_ROUTES) {
    if ('part' in route) forms.set(route.part, tool);
    if ('compose' in route) for (const part of route.compose) forms.set(part, tool);
    if ('branches' in route)
      for (const [value, branch] of Object.entries(route.branches))
        forms.set(branch.part, `${tool} ${route.key} ${value}`);
  }
  for (const [tool, operation] of domain.MCP_OPERATION_TOOLS)
    if (!forms.has(tool)) forms.set(tool, `operation_call ${operation}`);
  return forms;
}

function namesOf(domain: z.infer<typeof DOMAIN>): Names {
  const known = new Set([...domain.MCP_TOOL_NAMES, ...Object.values(OUTSIDE_NAMES).flat()]);
  const domains = new Set(domain.MCP_TOOL_DOMAINS);
  const verbs = new Set(
    domain.MCP_PART_NAMES.map((name) => name.split('_')[0] ?? '').filter(
      (verb) => !domains.has(verb),
    ),
  );
  return {
    known,
    verbs,
    publicForm: publicForms(domain),
    looksLikeTool: domain.looksLikeMcpTool,
  };
}

function missingTools(text: string, names: Names): readonly string[] {
  return [...text.matchAll(TOOL_LOOKING)]
    .map((match) => match[0])
    .filter((token) => {
      const [verb = ''] = token.split('_');
      return (names.verbs.has(verb) || names.looksLikeTool(token)) && !names.known.has(token);
    });
}

function descriptionsOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(descriptionsOf).join('\n');
  if (typeof value !== 'object' || value === null) return '';
  return Object.entries(value)
    .map(([key, entry]) =>
      (key === 'description' || key === 'title') && typeof entry === 'string'
        ? entry
        : descriptionsOf(entry),
    )
    .join('\n');
}

function describeMissing(token: string, names: Names): string {
  const form = names.publicForm.get(token);
  return form === undefined ? `${token} (not a public tool)` : `${token} (public form: ${form})`;
}

function literalsOf(source: string): readonly string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    )
      found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true));
  return found;
}

function prose(source: string): readonly string[] {
  return literalsOf(source).filter((text) => /\s/.test(text));
}

function proseFindings(file: string, names: Names): readonly string[] {
  return prose(readFileSync(file, 'utf8')).flatMap((text) =>
    missingTools(text, names).map(
      (token) => `${relative(root, file)}: ${describeMissing(token, names)}`,
    ),
  );
}

async function load<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await import(pathToFileURL(join(root, path)).href));
}

let domain: z.infer<typeof DOMAIN>;
let names: Names;

beforeAll(async () => {
  domain = await load('packages/domain/src/index.ts', DOMAIN);
  names = namesOf(domain);
});

describe('the tool-name check', () => {
  it('flags a part that is not a public tool and names its public form', () => {
    const [token = ''] = missingTools('match keys from list_signal_kinds', names);
    expect(describeMissing(token, names)).toBe(
      'list_signal_kinds (public form: signal_read view kinds)',
    );
  });

  it('flags a made-up tool that starts like a real one', () => {
    expect(missingTools('call list_everything first', names)).toEqual(['list_everything']);
  });

  it('flags a domain_verb name that is not a tool, and an old verb_noun name', () => {
    expect(missingTools('use device_start, then find_devices', names)).toEqual([
      'device_start',
      'find_devices',
    ]);
  });

  it('accepts public tools, the dispatcher and ordinary snake_case words', () => {
    expect(
      missingTools('signal_read view kinds, tool_call, energy_in, baby_cry, tool_read', names),
    ).toEqual([]);
  });

  it('judges only sentences in source, not bare tool names used as code', () => {
    expect(prose("const a = 'list_devices'; const b = `use list_devices now`;")).toEqual([
      'use list_devices now',
    ]);
  });
});

const CODE_ROOTS: readonly string[] = ['packages', 'apps/hub/src'];

const SKIPPED_FOLDERS: ReadonlySet<string> = new Set(['node_modules', 'dist', 'out', 'build']);

function sourceFiles(from: string): readonly string[] {
  return readdirSync(from, { withFileTypes: true }).flatMap((entry) => {
    const at = join(from, entry.name);
    if (entry.isDirectory()) return SKIPPED_FOLDERS.has(entry.name) ? [] : sourceFiles(at);
    return entry.isFile() && entry.name.endsWith('.ts') ? [at] : [];
  });
}

let words: ReadonlySet<string> | null = null;

function codeWords(): ReadonlySet<string> {
  if (words !== null) return words;
  const found = new Set<string>();
  for (const path of CODE_ROOTS)
    for (const file of sourceFiles(join(root, path)))
      for (const match of readFileSync(file, 'utf8').matchAll(/[A-Za-z_][A-Za-z0-9_]*/gu))
        found.add(match[0]);
  words = found;
  return found;
}

const LISTED = z.object({
  inputSchema: z.object({ properties: z.record(z.string(), z.unknown()).optional() }),
});

function topParameters(tools: z.infer<typeof HUB_TOOLS>['TOOLS']): ReadonlySet<string> {
  return new Set(
    tools.flatMap((tool) => Object.keys(LISTED.parse(tool.listing).inputSchema.properties ?? {})),
  );
}

function camelOf(word: string): string {
  return word.replace(/_([a-z0-9])/gu, (_match, letter: string) => letter.toUpperCase());
}

interface Vocabulary {
  readonly known: ReadonlySet<string>;
  readonly code: ReadonlySet<string>;
  readonly parameters: ReadonlySet<string>;
  readonly selectors: ReadonlySet<string>;
}

function driftOf(text: string, vocabulary: Vocabulary): readonly string[] {
  const camel = [...text.matchAll(/`([a-z]+[A-Z][A-Za-z0-9]*)`/gu)]
    .map((match) => match[1] ?? '')
    .filter((word) => !vocabulary.code.has(word))
    .map((word) => `${word} (no such name in the code)`);
  const snake = [...text.matchAll(/`([a-z]+(?:_[a-z0-9]+)+)`/gu)]
    .map((match) => match[1] ?? '')
    .filter((word) => vocabulary.parameters.has(camelOf(word)) && !vocabulary.known.has(word))
    .map((word) => `${word} (the parameter is ${camelOf(word)})`);
  const selectors = [...text.matchAll(/\b(?:action|view) `([a-z_]+)`/gu)]
    .map((match) => match[1] ?? '')
    .filter((value) => !vocabulary.selectors.has(value))
    .map((value) => `${value} (no tool has this action or view)`);
  return [...camel, ...snake, ...selectors];
}

describe('the product skills', () => {
  const folders = readdirSync(join(root, 'packages/harness/skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it.each(folders)('%s names only fields and selector values that exist', async (folder) => {
    const { TOOLS } = await load('apps/hub/src/extensions/mcp/tools/index.ts', HUB_TOOLS);
    const vocabulary: Vocabulary = {
      known: names.known,
      code: codeWords(),
      parameters: topParameters(TOOLS),
      selectors: new Set(
        [...domain.MCP_ROUTES.values()].flatMap((route) =>
          'branches' in route ? Object.keys(route.branches) : [],
        ),
      ),
    };
    const text = readFileSync(join(root, 'packages/harness/skills', folder, 'SKILL.md'), 'utf8');
    expect(driftOf(text, vocabulary)).toEqual([]);
  });

  it('finds the skills it judges', () => {
    expect(folders.length).toBeGreaterThanOrEqual(10);
  });

  it.each(folders)('%s names only tools that exist', (folder) => {
    const text = readFileSync(join(root, 'packages/harness/skills', folder, 'SKILL.md'), 'utf8');
    expect(missingTools(text, names).map((token) => describeMissing(token, names))).toEqual([]);
  });

  it.each(folders)(
    '%s triggers on a bounded description with a boundary and stays short',
    (folder) => {
      const text = readFileSync(join(root, 'packages/harness/skills', folder, 'SKILL.md'), 'utf8');
      const [, name = '', description = ''] = FRONT_MATTER.exec(text) ?? [];
      expect(name).toBe(folder);
      expect(description.length).toBeGreaterThan(80);
      expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(description).toMatch(/\bnot for\b/iu);
      expect(text.length - (FRONT_MATTER.exec(text)?.[0].length ?? 0)).toBeLessThanOrEqual(
        BODY_MAX,
      );
      expect(text).not.toMatch(/\b(MUST|NEVER|ALWAYS)\b/u);
    },
  );

  it('ships generated skills that name only tools that exist', () => {
    const catalogue = CATALOGUE.parse(
      JSON.parse(readFileSync(join(root, 'packages/harness/skills/catalogue.json'), 'utf8')),
    );
    const findings = catalogue.skills.flatMap((skill) =>
      missingTools(skill.content, names).map(
        (token) => `${skill.name}: ${describeMissing(token, names)}`,
      ),
    );
    expect(findings).toEqual([]);
  });
});

describe('the texts the model reads', () => {
  it('has a tool guide and server instructions that name only tools that exist', async () => {
    const { TOOL_GUIDE } = await load('apps/hub/src/ai-tools/tool-guide.ts', GUIDE);
    const { serverInstructions } = await load(
      'apps/hub/src/extensions/mcp/instructions.ts',
      INSTRUCTIONS,
    );
    const text = `${TOOL_GUIDE}\n${serverInstructions(domain.MCP_TOOL_NAMES)}`;
    expect(missingTools(text, names).map((token) => describeMissing(token, names))).toEqual([]);
  });

  it('has public tool listings that name only tools that exist', async () => {
    const { TOOLS } = await load('apps/hub/src/extensions/mcp/tools/index.ts', HUB_TOOLS);
    expect(TOOLS.length).toBeGreaterThan(90);
    const findings = TOOLS.flatMap((tool) =>
      missingTools(descriptionsOf(tool.listing), names).map(
        (token) => `${tool.name}: ${describeMissing(token, names)}`,
      ),
    );
    expect(findings).toEqual([]);
  });

  it('has catalogue descriptions that name only tools that exist', () => {
    const findings = domain.MCP_TOOLS.flatMap((tool) =>
      missingTools(tool.description, names).map(
        (token) => `${tool.name}: ${describeMissing(token, names)}`,
      ),
    );
    expect(findings).toEqual([]);
  });

  it('has source sentences, descriptions and errors that name only tools that exist', () => {
    const files = PROSE_ROOTS.flatMap((path) => filesUnder(join(root, path))).filter((file) =>
      file.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((file) => proseFindings(file, names))).toEqual([]);
  });
});

describe('the catalogue generator', () => {
  const skillsRoot = join(root, 'packages/harness/skills');
  const script = join(root, 'tooling/generate-product-skills.ts');
  const tsx = join(root, 'node_modules/.bin/tsx');
  let scratch = '';

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'product-skills-'));
    cpSync(skillsRoot, join(scratch, 'skills'), { recursive: true });
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  function run(): void {
    execFileSync(tsx, [script, join(scratch, 'skills')], { cwd: root, stdio: 'pipe' });
  }

  function catalogue(): string {
    return readFileSync(join(scratch, 'skills', 'catalogue.json'), 'utf8');
  }

  it('reproduces the committed catalogue byte for byte, twice', () => {
    run();
    const first = catalogue();
    run();
    expect(catalogue()).toBe(first);
    expect(first).toBe(readFileSync(join(skillsRoot, 'catalogue.json'), 'utf8'));
  }, 60_000);

  it('overwrites a staging file left by a killed run', () => {
    writeFileSync(join(scratch, '.catalogue.json.tmp'), 'junk');
    run();
    expect(catalogue()).toBe(readFileSync(join(skillsRoot, 'catalogue.json'), 'utf8'));
  }, 60_000);

  it('rejects a skill name without the smarteverything- prefix', () => {
    const folder = join(scratch, 'skills', 'foo-bar');
    mkdirSync(folder);
    writeFileSync(
      join(folder, 'SKILL.md'),
      '---\nname: foo-bar\ndescription: A skill with a foreign name.\n---\n\n# Foo\n',
    );
    expect(run).toThrow();
  }, 60_000);
});
