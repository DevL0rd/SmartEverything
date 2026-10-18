import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';

export function toolProblems(
  schema: Readonly<Record<string, JsonValue>>,
  args: Readonly<Record<string, JsonValue>>,
): readonly string[] {
  const checked = z.fromJSONSchema(schema).safeParse(args);
  return checked.success
    ? []
    : checked.error.issues.map((issue) =>
        issue.path.length === 0
          ? issue.message
          : `${issue.path.map(String).join('.')}: ${issue.message}`,
      );
}
