import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositorySourcePaths } from './automation-sources';
import { repositoryRoot } from './repository-files';

const HISTORIC_CODE: readonly RegExp[] = [/^apps\/hub\/src\/store\/migrations\//];

const HISTORIC_TESTS: readonly RegExp[] = [
  /^apps\/hub\/test\/store\/[^/]*migration[^/]*\.test\.ts$/,
];

const GUARDS = /^tooling\/guards\/(?:no-automation-v2|automation-describe-only)\.test\.ts$/;

const MODULE_SPECIFIER = /(?:from|import|export\s*\*\s*from)\s*\(?\s*['"]([^'"]+)['"]/g;

const RETIRED_MODULE =
  /(?:^|\/)(?:legacy\/v[12]-[a-z-]+|automation-v2[a-z-]*|automation-tree|automation-references|automation-actions|automation-conditions|automation-sequences|endpoints-automation|served-automations|outline-v2[a-z-]*)(?:\.[jt]sx?)?$/;

const RETIRED_SYMBOLS: readonly string[] = [
  'AUTOMATION_V2',
  'AutomationV2',
  'identifiedAutomationV2',
  'automationV2Of',
  'sequenceV2Of',
  'EDIT_AUTOMATION_V2',
  'AUTOMATION_DEFINITION',
  'AutomationDefinition',
  'AUTOMATION_SEQUENCE_DEFINITION',
  'AutomationSequenceDefinition',
  'TRIGGER_V2',
  'TriggerV2',
  'STEP_V2',
  'StepV2',
  'CONDITION_V2',
  'ConditionV2',
  'SignalTriggerV2',
  'matcherOfV2',
  'stepsV2Of',
  'triggerV2Of',
  'conditionsV2Of',
];

const RETIRED_SYMBOL = new RegExp(`\\b(?:${RETIRED_SYMBOLS.join('|')})\\b`);

const isHistoric = (path: string): boolean =>
  HISTORIC_CODE.some((pattern) => pattern.test(path)) ||
  HISTORIC_TESTS.some((pattern) => pattern.test(path));

const sourceOf = (path: string): string => readFileSync(join(repositoryRoot, path), 'utf8');

const retiredImports = (text: string): readonly string[] =>
  [...text.matchAll(MODULE_SPECIFIER)]
    .map((match) => match[1] ?? '')
    .filter((specifier) => RETIRED_MODULE.test(specifier));

describe('the retired V1 and V2 automation code', () => {
  const live = repositorySourcePaths().filter((path) => !isHistoric(path) && !GUARDS.test(path));

  it('is not imported outside the historic migrations and their tests', () => {
    const offences = live.flatMap((path) =>
      retiredImports(sourceOf(path)).map((specifier) => `${path} imports ${specifier}`),
    );
    expect(offences).toEqual([]);
  });

  it('is not named outside the historic migrations and their tests', () => {
    const offences = live
      .filter((path) => RETIRED_SYMBOL.test(sourceOf(path)))
      .map((path) => `${path} names a V1 or V2 automation symbol`);
    expect(offences).toEqual([]);
  });
});
