const RETIRED_PAGES: readonly (readonly [string, string])[] = [
  ['assistant/openrouter/models', 'assistant/models'],
  ['assistant/openrouter', 'assistant'],
  ['assistant/responder', 'assistant'],
  ['assistant/claude-code', 'assistant'],
  ['assistant/codex', 'assistant'],
];

export function retiredPageTarget(id: string): string | null {
  const found = RETIRED_PAGES.find(([retired]) => id === retired || id.startsWith(`${retired}/`));
  return found === undefined ? null : found[1];
}
