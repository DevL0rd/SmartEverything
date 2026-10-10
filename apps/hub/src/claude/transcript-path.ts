import { join } from 'node:path';
import { sizeOf } from './transcript-file';

function projectDirectory(cwd: string): string {
  return cwd.replaceAll(/[^A-Za-z0-9]/g, '-');
}

export function transcriptCandidates(
  projects: string,
  directories: readonly (string | undefined)[],
  sessionId: string,
): string[] {
  const unique = [...new Set(directories.filter((cwd) => cwd !== undefined))];
  return unique.map((cwd) => join(projects, projectDirectory(cwd), `${sessionId}.jsonl`));
}

export async function resolveTranscript(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if ((await sizeOf(candidate)) !== null) {
      return candidate;
    }
  }
  return candidates[0] ?? null;
}
