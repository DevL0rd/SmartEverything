import type { z } from 'zod';

export function issuesOf(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) =>
    issue.path.length === 0
      ? issue.message
      : `${issue.path.map(String).join('.')}: ${issue.message}`,
  );
}

export function describeIssues(error: z.ZodError): string {
  return issuesOf(error).join('; ');
}
