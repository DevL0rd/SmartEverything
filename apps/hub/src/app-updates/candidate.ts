import {
  latestAppUpdate,
  type AppUpdateEntry,
  type AppUpdateFile,
  type AppUpdateIndex,
} from '@smarteverything/domain';

export class AppUpdateCandidateError extends Error {
  override readonly name = 'AppUpdateCandidateError';
}

function filesMatch(first: readonly AppUpdateFile[], second: readonly AppUpdateFile[]): boolean {
  if (first.length !== second.length) return false;
  const identity = (file: AppUpdateFile): string =>
    JSON.stringify([file.path, file.sha256, file.contentType, file.fileExtension]);
  const ordered = second.map(identity).sort();
  return first
    .map(identity)
    .sort()
    .every((file, index) => file === ordered[index]);
}

export function contentsMatch(first: AppUpdateEntry, second: AppUpdateEntry): boolean {
  return first.launch?.sha256 === second.launch?.sha256 && filesMatch(first.files, second.files);
}

export function verifyNextOffer(index: AppUpdateIndex, candidate: AppUpdateEntry): void {
  if (index.entries.some(({ id }) => id === candidate.id)) {
    throw new AppUpdateCandidateError(`Update ${candidate.id} is already recorded in this hub.`);
  }
  const latest = latestAppUpdate(index.entries, candidate);
  if (latest === null) return;
  if (contentsMatch(latest, candidate)) {
    throw new AppUpdateCandidateError(`The same app content is already offered as ${latest.id}.`);
  }
  if (Date.parse(candidate.createdAt) <= Date.parse(latest.createdAt)) {
    throw new AppUpdateCandidateError(
      'The candidate must be newer than the update already offered.',
    );
  }
}
