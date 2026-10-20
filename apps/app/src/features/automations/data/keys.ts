const ROOT = ['window', 'automations-v3'] as const;

export const automationKeys = {
  all: ROOT,
  draft: (automationId: string) => [...ROOT, 'draft', automationId] as const,
  revisions: (automationId: string) => [...ROOT, 'revisions', automationId] as const,
  revision: (automationId: string, revision: number) =>
    [...ROOT, 'revision', automationId, revision] as const,
  compare: (automationId: string, from: number, to: number | 'draft') =>
    [...ROOT, 'compare', automationId, from, to] as const,
  functions: () => [...ROOT, 'functions'] as const,
  function: (functionId: string) => [...ROOT, 'function', functionId] as const,
  runs: (automationId: string | null) => [...ROOT, 'runs', automationId ?? 'all'] as const,
  run: (runId: string) => [...ROOT, 'run', runId] as const,
  nodes: (runId: string, after: number, nodeId: string | null, iteration: number | null) =>
    [...ROOT, 'nodes', runId, after, nodeId, iteration] as const,
  decisions: (automationId: string) => [...ROOT, 'decisions', automationId] as const,
  tests: (automationId: string) => [...ROOT, 'tests', automationId] as const,
  secrets: () => [...ROOT, 'secrets'] as const,
  questions: () => [...ROOT, 'questions'] as const,
} as const;
