import { useState } from 'react';
import type { AppHref } from '../../../components/app-href';
import {
  HOME_MAP_MAP_ID,
  type HomeMap,
  type HomeMapId,
  type HomeMapScan,
  type HomeMapVersion,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { compareText } from '../../../format/text';
import { moment } from '../../../format/time';
import type { HomeMapSetOutcome } from '../data/map-set-query';
import { SCAN_UPLOAD_PROBLEM_TEXT, uploadLine, type ScanUploadState } from '../data/scan-upload';
import type { EditorTool } from '../editor/tool-state';
import { EDITOR_PATH } from '../model/create-map';

export function mapIdOf(raw: unknown): HomeMapId | null {
  const parsed = HOME_MAP_MAP_ID.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function editorHref(mapId: HomeMapId, tool?: EditorTool): AppHref {
  return { pathname: EDITOR_PATH, params: tool === undefined ? { mapId } : { mapId, tool } };
}

export function scanLine(scan: HomeMapScan): string {
  return `${scan.file.name} · ${scan.residualM === null ? 'not lined up yet' : 'lined up'}`;
}

export function scanUploadSubtitle(upload: ScanUploadState): string | null {
  if (upload.kind === 'uploading') return uploadLine(upload.sentBytes, upload.totalBytes);
  if (upload.kind === 'failed') return SCAN_UPLOAD_PROBLEM_TEXT[upload.problem];
  return null;
}

export function versionTitle(version: HomeMapVersion, now: number): string {
  const when = moment(version.createdAt, now);
  return version.name === null ? `Saved ${when}` : `${version.name} · ${when}`;
}

export function newestFirst(versions: readonly HomeMapVersion[]): readonly HomeMapVersion[] {
  return [...versions].sort((a, b) => compareText(b.createdAt, a.createdAt));
}

export function roomCountLine(count: number): string {
  return `${String(count)} room${count === 1 ? '' : 's'}`;
}

export type DangerAction = 'reset' | 'delete';

export interface DangerCopy {
  readonly title: string;
  readonly line: string;
  readonly confirm: string;
}

export const DANGER_TEXT: Readonly<Record<DangerAction, DangerCopy>> = {
  reset: {
    title: "Reset to the robot's map",
    line: 'Drops your shapes, keeps furniture and devices',
    confirm: 'Reset',
  },
  delete: {
    title: 'Delete this map',
    line: 'Devices stay in their rooms',
    confirm: 'Delete',
  },
};

export function dangerActions(map: Pick<HomeMap, 'sources'>): readonly DangerAction[] {
  return map.sources.length === 0 ? ['delete'] : ['reset', 'delete'];
}

const PROBLEMS: Readonly<Record<'offline' | 'unconfirmed', string>> = {
  offline: 'Connect to the hub to change this map',
  unconfirmed: "Couldn't confirm the change · Check the map and try again",
};

export function outcomeProblem(outcome: HomeMapSetOutcome<unknown>): string | null {
  if (outcome.kind === 'done') return null;
  return outcome.kind === 'refused' ? outcome.message : PROBLEMS[outcome.kind];
}

export interface Run {
  readonly go: (send: () => Promise<HomeMapSetOutcome<unknown>>, done?: () => void) => void;
  readonly busy: boolean;
  readonly problem: string | null;
}

export function useRun(): Run {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (
    send: () => Promise<HomeMapSetOutcome<unknown>>,
    done: (() => void) | undefined,
  ): Promise<void> => {
    setBusy(true);
    setProblem(null);
    const outcome = await send();
    setBusy(false);
    setProblem(outcomeProblem(outcome));
    if (outcome.kind === 'done') done?.();
  };
  return {
    go: (send, done): void => {
      if (!busy) background(run(send, done), 'home_map.settings_change_failed');
    },
    busy,
    problem,
  };
}
