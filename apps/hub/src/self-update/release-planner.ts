import { PIPELINE_COMPONENTS, type PipelineComponent } from '@smarteverything/domain';

type Rule = readonly [match: RegExp, components: readonly PipelineComponent[]];

const NOTHING: readonly PipelineComponent[] = [];
const EVERYTHING: readonly PipelineComponent[] = PIPELINE_COMPONENTS;

const SHIPPED_NOTHING: readonly RegExp[] = [
  /(?:^|\/)tests?\//u,
  /\.test\.tsx?$/u,
  /^tooling\/guards\//u,
  /^tooling\/dependency-contracts\//u,
  /^tooling\/eslint\//u,
  /^docs\//u,
  /^release-notes\//u,
  /^\.(?:github|agents|claude|design-sync|codegraph)\//u,
  /\.md$/u,
  /^(?:\.editorconfig|\.gitignore|\.gitleaks\.toml|\.jscpd\.json|\.licenserc\.json|\.markdown-link-check\.json|\.prettierignore|\.prettierrc\.json|commitlint\.config\.js|cspell\.json|eslint\.config\.js|knip\.json|renovate\.json|skills-lock\.json|stryker[\w.]*\.json|timeout|vitest[\w.]*\.ts)$/u,
];

const NATIVE_APP =
  /^apps\/app\/(?:modules\/|plugins\/|android\/|certs\/|app\.config\.ts$|app-identity\.json$|fingerprint\.config\.js$|google-services\.json$|package\.json$)/u;

const RULES: readonly Rule[] = [
  [
    /^(?:pnpm-lock\.yaml|pnpm-workspace\.yaml|package\.json|\.npmrc|\.nvmrc|tsconfig[\w.]*\.json|patches\/)/u,
    EVERYTHING,
  ],
  [NATIVE_APP, ['app', 'ui']],
  [/^apps\/app\//u, ['ui']],
  [/^apps\/desktop\//u, ['desktop']],
  [/^apps\/hub\/src\/(?:node|client-network|network|data-layout|service)\//u, ['hub', 'desktop']],
  [/^apps\/hub\//u, ['hub']],
  [/^packages\/(?:domain|logging)\//u, ['hub', 'ui', 'desktop']],
  [/^packages\/(?:flow|shelly)\//u, ['hub', 'ui']],
  [/^packages\/harness\//u, ['hub', 'desktop']],
  [/^packages\/(?:ble|google|ipp|models|smartthings|tuya|xiaomi|optimization)\//u, ['hub']],
  [/^tooling\//u, ['hub']],
];

export interface ReleasePlan {
  readonly components: readonly PipelineComponent[];
}

function componentsOf(path: string): readonly PipelineComponent[] {
  if (SHIPPED_NOTHING.some((pattern) => pattern.test(path))) return NOTHING;
  return RULES.find(([match]) => match.test(path))?.[1] ?? EVERYTHING;
}

export function planRelease(changedPaths: readonly string[]): ReleasePlan {
  const needed = new Set(changedPaths.flatMap((path) => componentsOf(path)));
  return { components: PIPELINE_COMPONENTS.filter((component) => needed.has(component)) };
}
