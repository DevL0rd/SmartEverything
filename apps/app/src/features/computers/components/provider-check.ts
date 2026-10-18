import { CLAUDE_PROVIDER_OPTIONS, type ClaudeProviderOptions } from '@smarteverything/domain';

export function checkOptions(
  candidate: unknown,
  key: string,
  change: (value: ClaudeProviderOptions) => void,
  invalid: (key: string, reason: string | null) => void,
): void {
  const checked = CLAUDE_PROVIDER_OPTIONS.safeParse(candidate);
  invalid(
    key,
    checked.success ? null : checked.error.issues.map((issue) => issue.message).join('; '),
  );
  if (checked.success) change(checked.data);
}
