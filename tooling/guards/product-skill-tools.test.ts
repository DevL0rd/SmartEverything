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
  z.object({ key: z.string(), parts: z.record(z.string(), z.string()) }),
  z.object({ compose: z.array(z.string()) }),
  z.object({ custom: z.literal(true) }),
]);

const DOMAIN = z.object({
  MCP_TOOL_NAMES: z.array(z.string()),
  MCP_PART_NAMES: z.array(z.string()),
  MCP_OPERATION_TOOLS: z.array(z.tuple([z.string(), z.string()])),
  MCP_ROUTES: z.map(z.string(), ROUTE),
  MCP_TOOLS: z.array(z.object({ name: z.string(), description: z.string() })),
  MCP_PART_TEXTS: z.array(z.object({ name: z.string(), description: z.string() })),
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
  skills: z.array(z.object({ name: z.string(), content: z.string() })),
});

const OUTSIDE_NAMES = {
  dispatcher: ['call_tool'],
  nativeAgent: ['apply_patch'],
  nativeComputer: [
    'read_image',
    'set_working_directory',
    'publish_file_preview',
    'publish_preview',
    'revoke_preview',
  ],
  liveCall: ['end_conversation', 'stop_looking'],
  settingKey: ['claude_skills_enabled', 'call_audio'],
  fieldName: [
    'refresh_token',
    'read_at',
    'tool_switches',
    'ai_listens',
    'record_events',
    'ai_defaults',
    'claude_link_auto',
  ],
  actionValue: ['set_member', 'remove_member', 'delete_message', 'show_camera'],
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
  'apps/hub/src/plugins/builtin/shelly-presence',
  'apps/hub/src/plugins/builtin/wiz',
];

interface Names {
  readonly known: ReadonlySet<string>;
  readonly verbs: ReadonlySet<string>;
  readonly publicForm: ReadonlyMap<string, string>;
}

function publicForms(domain: z.infer<typeof DOMAIN>): ReadonlyMap<string, string> {
  const forms = new Map<string, string>();
  for (const [tool, route] of domain.MCP_ROUTES) {
    if ('part' in route) forms.set(route.part, tool);
    if ('compose' in route) for (const part of route.compose) forms.set(part, tool);
    if ('parts' in route)
      for (const [value, part] of Object.entries(route.parts))
        forms.set(part, `${tool} ${route.key} ${value}`);
  }
  for (const [tool, operation] of domain.MCP_OPERATION_TOOLS)
    if (!forms.has(tool)) forms.set(tool, `call_operation ${operation}`);
  return forms;
}

function namesOf(domain: z.infer<typeof DOMAIN>): Names {
  const known = new Set([...domain.MCP_TOOL_NAMES, ...Object.values(OUTSIDE_NAMES).flat()]);
  const verbs = new Set(
    [...domain.MCP_TOOL_NAMES, ...domain.MCP_PART_NAMES].map((name) => name.split('_')[0] ?? ''),
  );
  return { known, verbs, publicForm: publicForms(domain) };
}

function missingTools(text: string, names: Names): readonly string[] {
  return [...text.matchAll(TOOL_LOOKING)]
    .map((match) => match[0])
    .filter((token) => {
      const [verb = ''] = token.split('_');
      return names.verbs.has(verb) && !names.known.has(token);
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
      'list_signal_kinds (public form: read_signals view kinds)',
    );
  });

  it('flags a made-up tool that starts like a real one', () => {
    expect(missingTools('call list_everything first', names)).toEqual(['list_everything']);
  });

  it('accepts public tools, the dispatcher and ordinary snake_case words', () => {
    expect(
      missingTools('read_signals view kinds, call_tool, energy_in, baby_cry, tool_details', names),
    ).toEqual([]);
  });

  it('judges only sentences in source, not bare tool names used as code', () => {
    expect(prose("const a = 'list_devices'; const b = `use list_devices now`;")).toEqual([
      'use list_devices now',
    ]);
  });
});

describe('the product skills', () => {
  const folders = readdirSync(join(root, 'packages/harness/skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  it('finds the skills it judges', () => {
    expect(folders.length).toBeGreaterThanOrEqual(10);
  });

  it.each(folders)('%s names only tools that exist', (folder) => {
    const text = readFileSync(join(root, 'packages/harness/skills', folder, 'SKILL.md'), 'utf8');
    expect(missingTools(text, names).map((token) => describeMissing(token, names))).toEqual([]);
  });

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
    const findings = [...domain.MCP_TOOLS, ...domain.MCP_PART_TEXTS].flatMap((tool) =>
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
