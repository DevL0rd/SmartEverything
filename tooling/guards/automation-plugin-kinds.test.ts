import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  NODE_REGISTRY,
  PLUGIN_MANIFEST,
  automationOwnerKey,
  type PluginManifest,
} from '@smarteverything/domain';
import { assembleContribution } from '../../apps/hub/src/automations/plugin-kinds/assemble';
import {
  driverContribution,
  pluginContribution,
  type AutomationContribution,
  type DriverAutomationInput,
} from '../../apps/hub/src/automations/plugin-kinds/contributions';
import { BUILTIN_PLUGINS } from '../../apps/hub/src/plugins/builtin';
import { filesUnder, repositoryRoot } from './repository-files';

const CORE_FOLDER = join(repositoryRoot, 'packages', 'domain', 'src', 'automation-nodes');

const LOCAL_DRIVERS = join(repositoryRoot, 'apps', 'hub', 'src', 'local');

const GENERIC_PLUGIN_TOKENS: readonly string[] = ['plugin_entity'];

const SOURCE_FILE = /\.tsx?$/u;

const DRIVER_FILE = /(?:^|\/)(?:[a-z-]+-)?automation\.ts$/u;

interface Forbidden {
  readonly pluginIds: readonly string[];
  readonly events: readonly string[];
}

interface Offence {
  readonly file: string;
  readonly token: string;
  readonly reason: string;
}

function wordsOf(text: string): readonly string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9]+/u)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

function containsRun(words: readonly string[], run: readonly string[]): boolean {
  if (run.length === 0) return false;
  for (let at = 0; at + run.length <= words.length; at += 1) {
    if (run.every((word, offset) => words[at + offset] === word)) return true;
  }
  return false;
}

function isSignalSource(text: string, words: readonly string[]): boolean {
  const stripped = GENERIC_PLUGIN_TOKENS.reduce((rest, token) => rest.replaceAll(token, ''), text);
  return (
    /plugin_/iu.test(stripped) ||
    containsRun(words, ['plugin', 'signal']) ||
    containsRun(words, ['plugin', 'source'])
  );
}

function literalNamesId(text: string, id: string): boolean {
  const normal = text.trim().toLowerCase().replaceAll('_', '-');
  return normal === id || normal.startsWith(`${id}.`) || normal.startsWith(`${id}:`);
}

function literalProblem(text: string, forbidden: Forbidden): string | null {
  const words = wordsOf(text);
  if (isSignalSource(text, words)) return 'names a plugin signal source';
  if (forbidden.pluginIds.some((id) => literalNamesId(text, id))) {
    return 'names a built-in plugin id';
  }
  return forbidden.events.includes(text.trim()) ? 'names a plugin event constant' : null;
}

function identifierProblem(text: string, forbidden: Forbidden): string | null {
  const words = wordsOf(text);
  if (isSignalSource(text, words)) return 'names a plugin signal source';
  if (forbidden.pluginIds.some((id) => containsRun(words, wordsOf(id)))) {
    return 'names a built-in plugin id';
  }
  const named = forbidden.events.some((kind) => {
    const run = wordsOf(kind);
    return run.length > 1 && containsRun(words, run);
  });
  return named ? 'names a plugin event constant' : null;
}

function tokenOf(node: ts.Node): { readonly text: string; readonly literal: boolean } | null {
  if (ts.isIdentifier(node)) return { text: node.text, literal: false };
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { text: node.text, literal: true };
  }
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return { text: node.text, literal: true };
  }
  return null;
}

export function pluginOffences(
  file: string,
  text: string,
  forbidden: Forbidden,
): readonly Offence[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: Offence[] = [];
  const visit = (node: ts.Node): void => {
    const token = tokenOf(node);
    if (token !== null) {
      const reason = token.literal
        ? literalProblem(token.text, forbidden)
        : identifierProblem(token.text, forbidden);
      if (reason !== null) found.push({ file, token: token.text, reason });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function manifestOf(plugin: { readonly manifest: unknown }): PluginManifest {
  return PLUGIN_MANIFEST.parse(plugin.manifest);
}

const MANIFESTS: readonly PluginManifest[] = BUILTIN_PLUGINS.map(manifestOf);

const FORBIDDEN: Forbidden = {
  pluginIds: MANIFESTS.map((manifest) => manifest.id),
  events: MANIFESTS.flatMap((manifest) =>
    manifest.contributes.events
      .map((event) => event.kind)
      .filter((kind) => wordsOf(kind).length > 1),
  ),
};

function coreOffences(forbidden: Forbidden): readonly string[] {
  return filesUnder(CORE_FOLDER)
    .filter((file) => SOURCE_FILE.test(file))
    .flatMap((file) =>
      pluginOffences(relative(repositoryRoot, file), readFileSync(file, 'utf8'), forbidden),
    )
    .map((offence) => `${offence.file}: ${offence.token} ${offence.reason}`);
}

function isDriverInput(value: unknown): value is DriverAutomationInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'automation' in value &&
    'version' in value
  );
}

async function localDriverInputs(): Promise<readonly DriverAutomationInput[]> {
  const files = filesUnder(LOCAL_DRIVERS)
    .map((file) => relative(LOCAL_DRIVERS, file).replace(/\\/gu, '/'))
    .filter((file) => DRIVER_FILE.test(file) && !file.endsWith('.test.ts'))
    .sort();
  const modules = await Promise.all(
    files.map((file): Promise<Record<string, unknown>> => import(join(LOCAL_DRIVERS, file))),
  );
  return modules.flatMap((module) => Object.values(module).filter(isDriverInput));
}

const DRIVER_INPUTS = await localDriverInputs();

interface Contributed {
  readonly label: string;
  readonly contribution: AutomationContribution;
}

function driverContributions(): readonly Contributed[] {
  return DRIVER_INPUTS.map((input) => {
    const built = driverContribution(input);
    if (!built.ok) throw new Error(`${input.id}: ${built.problem}`);
    return { label: `driver:${input.id}`, contribution: built.contribution };
  });
}

const CONTRIBUTIONS: readonly Contributed[] = [
  ...MANIFESTS.map((manifest) => ({
    label: `plugin:${manifest.id}`,
    contribution: pluginContribution(manifest),
  })),
  ...driverContributions(),
];

function prefixesOf(contribution: AutomationContribution): readonly string[] {
  const key = automationOwnerKey(contribution.owner);
  return [`plugin.${key}.`, `trigger.plugin.${key}.`];
}

describe('the core automation catalog keeps no plugin kinds', () => {
  it('names no plugin signal source, built-in plugin id or plugin event constant', () => {
    expect(coreOffences(FORBIDDEN)).toEqual([]);
  });

  it('has no kind with an origin, a plugin category or a plugin id', () => {
    const plugin = NODE_REGISTRY.kinds.filter(
      (kind) =>
        kind.origin !== undefined ||
        kind.category === 'plugins' ||
        kind.id.startsWith('plugin.') ||
        kind.id.startsWith('trigger.plugin.'),
    );
    expect(plugin.map((kind) => kind.id)).toEqual([]);
  });

  it('fails on a planted signal source, plugin id or event constant', () => {
    const planted = [
      "export const source = 'plugin_router';",
      'export const source = `plugin_${name}`;',
      'export const PLUGIN_SOURCE_PREFIX = 1;',
      "export const owner = 'router';",
      "export const owner = 'adguard.snapshot';",
      'export const routerPeople = 1;',
      'export const SHELLY_PRESENCE_ZONE = 1;',
      "export const event = 'person_arrived';",
      'export const PERSON_ARRIVED = 1;',
    ];
    for (const text of planted) {
      expect(pluginOffences('planted.ts', text, FORBIDDEN), text).not.toEqual([]);
    }
  });

  it('allows the generic plugin entity concept and prose that only mentions a product', () => {
    const allowed = [
      "export const yields = 'plugin_entity';",
      "export const text = 'Send it as a Discord message or a print from the router list.';",
      "export const person = 'place and router signals';",
      "export const keywords = ['alert', 'restarted'];",
      'export const wizard = 1;',
    ];
    for (const text of allowed) {
      expect(pluginOffences('allowed.ts', text, FORBIDDEN), text).toEqual([]);
    }
  });

  it('reads every built-in plugin and local driver contribution', () => {
    expect(MANIFESTS.map((manifest) => manifest.id)).toContain('router');
    expect(DRIVER_INPUTS.map((driver) => driver.id).sort()).toEqual(
      expect.arrayContaining(['larq_bottle', 'toothbrush', 'kingsmith_treadmill', 'watch']),
    );
    expect(CONTRIBUTIONS.length).toBe(MANIFESTS.length + DRIVER_INPUTS.length);
    expect(filesUnder(CORE_FOLDER).filter((file) => SOURCE_FILE.test(file)).length).toBeGreaterThan(
      0,
    );
  });
});

describe.each(CONTRIBUTIONS.map((item) => [item.label, item.contribution] as const))(
  'the contribution of %s',
  (_label, contribution) => {
    const assembled = assembleContribution(contribution);

    it('assembles with no rejected kind', () => {
      expect(assembled.rejections).toEqual([]);
    });

    it('starts every kind id with its owner prefix and tags every kind with its owner', () => {
      const prefixes = prefixesOf(contribution);
      for (const kind of assembled.kinds) {
        expect(
          prefixes.some((prefix) => kind.id.startsWith(prefix)),
          kind.id,
        ).toBe(true);
        expect(kind.origin).toMatchObject({
          kind: contribution.owner.kind,
          id: contribution.owner.id,
        });
      }
    });
  },
);

describe('ids across the core and every contribution', () => {
  it('are unique', () => {
    const ids = [
      ...NODE_REGISTRY.kinds.map((kind) => kind.id),
      ...CONTRIBUTIONS.flatMap((item) =>
        assembleContribution(item.contribution).kinds.map((kind) => kind.id),
      ),
    ];
    const seen = new Set<string>();
    const repeated = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(repeated).toEqual([]);
  });

  it('give every owner its own prefix', () => {
    const keys = CONTRIBUTIONS.map((item) => automationOwnerKey(item.contribution.owner));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
