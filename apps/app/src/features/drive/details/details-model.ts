import type { DriveItem, DrivePlacement, DriveRoot, DriveVersion } from '@smarteverything/domain';
import type { Bar } from '../../../components/charts/bars';
import type { StatusTone } from '../../../components/tone';
import { ValueStore, useValue } from '../../../design/external-store';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { dayKeyOf, shiftDay, startOfDayKey } from '../../../format/time';
import type { ByName, FolderSlotContext } from '../folder/folder-model';
import type { DriveAccess } from '../model/drive-access';
import { ROLE_LABEL } from '../share/share-model';

export const DETAILS_TABS = ['preview', 'info', 'versions', 'activity', 'sharing'] as const;

export type DetailsTab = (typeof DETAILS_TABS)[number];

export const TAB_LABEL: Readonly<Record<DetailsTab, string>> = {
  preview: 'Preview',
  info: 'Info',
  versions: 'Versions',
  activity: 'Activity',
  sharing: 'Sharing',
};

export interface DetailsSubject {
  readonly root: DriveRoot;
  readonly item: DriveItem;
  readonly label: string;
  readonly access: DriveAccess;
  readonly writable: boolean;
}

export interface DetailsSlots {
  readonly quickLook?: (item: DriveItem) => void;
}

const DEFAULT_TAB: DetailsTab = 'info';

const FILE_ONLY: ReadonlySet<DetailsTab> = new Set(['preview', 'versions']);

export function tabsOf(item: DriveItem): readonly DetailsTab[] {
  return DETAILS_TABS.filter((tab) => item.kind !== 'folder' || !FILE_ONLY.has(tab));
}

export function activeTabOf(remembered: DetailsTab, tabs: readonly DetailsTab[]): DetailsTab {
  return tabs.includes(remembered) ? remembered : DEFAULT_TAB;
}

const rememberedTab = new ValueStore<DetailsTab>(DEFAULT_TAB);

export function rememberTab(tab: DetailsTab): void {
  rememberedTab.set(tab);
}

export function readRememberedTab(): DetailsTab {
  return rememberedTab.get();
}

export function useRememberedTab(): DetailsTab {
  return useValue(rememberedTab);
}

export function subjectOf(
  context: Pick<FolderSlotContext, 'focused' | 'picked' | 'folder'>,
): DriveItem | null {
  return context.focused ?? context.picked.at(-1) ?? context.folder;
}

export type DetailsPresentation = 'docked' | 'sheet' | 'pull-up';

export const DOCK_FROM = 1024;

export function presentationOf(
  layout: 'compact' | 'icon' | 'wide',
  windowWidth: number,
): DetailsPresentation {
  if (layout === 'compact') return 'pull-up';
  return windowWidth >= DOCK_FROM ? 'docked' : 'sheet';
}

export const DETAILS_WIDTH = { initial: 360, min: 320, max: 560 } as const;

const paneWidth = new ValueStore<number>(DETAILS_WIDTH.initial);

export function setPaneWidth(width: number): void {
  paneWidth.set(width);
}

export function usePaneWidth(): number {
  return useValue(paneWidth);
}

const KIND_WORD: Readonly<Record<DriveItem['kind'], string>> = {
  folder: 'Folder',
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
  other: 'file',
};

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toUpperCase();
}

export function kindTextOf(item: DriveItem): string {
  if (item.kind === 'folder') return KIND_WORD.folder;
  const extension = extensionOf(item.name);
  const word = KIND_WORD[item.kind];
  return extension === null
    ? `${word.charAt(0).toUpperCase()}${word.slice(1)}`
    : `${extension} ${word}`;
}

export function previewableOf(item: DriveItem): boolean {
  if (item.kind !== 'image' && item.kind !== 'video') return false;
  return item.thumb.state === 'ready';
}

export type PreviewBody = 'picture' | 'sheet' | 'text' | 'none';

export const PREVIEW_HEAD_BYTES = 8 * 1024;

const SHEET_DELIMITER: Readonly<Record<string, string>> = {
  'text/csv': ',',
  'text/tab-separated-values': '\t',
  CSV: ',',
  TSV: '\t',
};

const TEXT_MIMES: ReadonlySet<string> = new Set([
  'application/json',
  'application/xml',
  'application/yaml',
  'application/x-yaml',
  'application/toml',
  'application/javascript',
  'application/x-sh',
]);

export function sheetDelimiterOf(item: DriveItem): string | null {
  if (item.kind === 'folder') return null;
  return SHEET_DELIMITER[item.mime] ?? SHEET_DELIMITER[extensionOf(item.name) ?? ''] ?? null;
}

export function previewBodyOf(item: DriveItem): PreviewBody {
  if (item.kind === 'folder') return 'none';
  if (sheetDelimiterOf(item) !== null) return 'sheet';
  if (item.mime.startsWith('text/') || TEXT_MIMES.has(item.mime)) return 'text';
  return item.thumb.state === 'ready' ? 'picture' : 'none';
}

export function headIsWhole(item: DriveItem): boolean {
  return item.bytes <= PREVIEW_HEAD_BYTES;
}

export function headLinesOf(text: string, whole: boolean): readonly string[] {
  const lines = text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  if (!whole || lines.at(-1) === '') lines.pop();
  return lines;
}

function cellsOf(line: string, delimiter: string): readonly string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (quoted && char === '"' && line.charAt(index + 1) === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

export interface SheetHead {
  readonly columns: number;
  readonly rows: readonly (readonly string[])[];
}

export function sheetHeadOf(lines: readonly string[], delimiter: string): SheetHead {
  const rows = lines.map((line) => cellsOf(line, delimiter));
  return { columns: rows.reduce((most, row) => Math.max(most, row.length), 0), rows };
}

export function columnNameOf(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : `${columnNameOf(Math.floor(index / 26) - 1)}${letter}`;
}

export const RING_SIZE = 16;

export const RING_THICKNESS = 3;

export interface RingDot {
  readonly key: string;
  readonly name: string;
  readonly tone: StatusTone | null;
}

export interface ComputerRing extends RingDot {
  readonly share: number;
  readonly word: string;
}

type PlacementFacts = Pick<DrivePlacement, 'id' | 'mode' | 'hold'> & {
  readonly status: Pick<DrivePlacement['status'], 'state' | 'needBytes'>;
};

interface RingLook {
  readonly tone: StatusTone | null;
  readonly word: string;
}

function stateLookOf(placement: PlacementFacts): RingLook {
  const { state, needBytes } = placement.status;
  switch (state) {
    case 'up_to_date':
      return { tone: 'positive', word: 'up to date' };
    case 'mounted':
      return { tone: 'positive', word: 'mounted' };
    case 'syncing':
      return { tone: 'info', word: `${bytes(needBytes)} left` };
    case 'starting':
      return { tone: 'info', word: 'starting' };
    case 'offline':
      return { tone: null, word: 'offline' };
    case 'stopped':
      return { tone: null, word: 'paused' };
    case 'blocked':
      return { tone: 'warning', word: 'blocked' };
    case 'failed':
      return {
        tone: 'critical',
        word: placement.mode === 'mounted' ? 'mount failed' : 'sync failed',
      };
  }
}

export function haveShare(placedBytes: number, needBytes: number): number {
  if (needBytes <= 0) return 1;
  return 1 - needBytes / Math.max(placedBytes, needBytes);
}

export function placementRingOf(
  placement: PlacementFacts,
  name: string,
  placedBytes: number,
): ComputerRing {
  const look: RingLook =
    placement.hold === null ? stateLookOf(placement) : { tone: 'warning', word: 'on hold' };
  const share =
    placement.mode === 'synced' ? haveShare(placedBytes, placement.status.needBytes) : 1;
  return { key: placement.id, name, tone: look.tone, share, word: look.word };
}

export function coversItem(folderRelPath: string | null, itemRelPath: string): boolean {
  if (folderRelPath === null) return true;
  return itemRelPath === folderRelPath || itemRelPath.startsWith(`${folderRelPath}/`);
}

export function dimensionsOf(item: DriveItem): string | null {
  if (item.kind !== 'image' && item.kind !== 'video') return null;
  if (item.width === null || item.height === null) return null;
  return `${String(item.width)} × ${String(item.height)}`;
}

export function sizeTextOf(item: DriveItem): string {
  return joinParts([kindTextOf(item), bytes(item.bytes)]);
}

function parentParts(item: DriveItem): readonly string[] {
  return item.relPath.split('/').slice(0, -1);
}

export function whereOf(subject: Pick<DetailsSubject, 'item' | 'label' | 'access'>): string {
  if (subject.access !== 'own' && subject.access !== 'shared') {
    return `Shared with me › ${subject.label}`;
  }
  return [subject.label, ...parentParts(subject.item)].join(' › ');
}

export interface WhoSees {
  readonly access: DriveAccess;
  readonly ownerName: string | null;
  readonly people: readonly string[];
}

function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

export function whoSeesOf(who: WhoSees): string {
  switch (who.access) {
    case 'shared':
      return 'Everyone in the home';
    case 'own':
      return who.people.length === 0 ? 'Only you' : `You and ${listed(who.people)}`;
    case 'edit':
    case 'view':
      return `Shared with you by ${who.ownerName ?? 'its owner'} · ${ROLE_LABEL[who.access]}`;
    case 'none':
      return `Shared with you by ${who.ownerName ?? 'its owner'}`;
  }
}

export interface IntegrityLine {
  readonly text: string;
  readonly tone: StatusTone | null;
}

export function integrityOf(item: DriveItem): IntegrityLine | null {
  if (item.kind === 'folder') return null;
  switch (item.integrity) {
    case 'ok':
      return { text: 'Checked, no damage found', tone: 'positive' };
    case 'corrupt':
      return { text: 'Damaged on disk. Restore an earlier version.', tone: 'critical' };
    case 'unknown':
      return { text: 'Not checked yet', tone: null };
  }
}

export type DeviceName = (deviceId: string) => string | null;

export function changedByOf(
  item: DriveItem,
  latest: DriveVersion | undefined,
  byName: ByName,
  deviceName: DeviceName,
): string | null {
  if (item.outside) return 'outside SmartEverything';
  if (latest?.rev !== item.rev) return null;
  const who = byName(latest.actorProfileId);
  const where = latest.deviceId === null ? null : deviceName(latest.deviceId);
  if (who === null) return where === null ? null : `on ${where}`;
  return where === null ? who : `${who} on ${where}`;
}

export const EDIT_DAYS = 30;

export function editWindowStart(today: string): number {
  return startOfDayKey(shiftDay(today, 1 - EDIT_DAYS));
}

export function editsPerDay(versions: readonly DriveVersion[], today: string): readonly Bar[] {
  const counts = new Map<string, number>();
  for (const version of versions) {
    const day = dayKeyOf(Date.parse(version.at));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: EDIT_DAYS }, (_unused, index) => {
    const day = shiftDay(today, index + 1 - EDIT_DAYS);
    return { key: day, value: counts.get(day) ?? 0 };
  });
}

export function editsTotal(bars: readonly Bar[]): number {
  return bars.reduce((sum, bar) => sum + bar.value, 0);
}

export function needsOlderVersions(
  versions: readonly DriveVersion[],
  windowStart: number,
  hasNext: boolean,
): boolean {
  if (!hasNext) return false;
  const oldest = versions.at(-1);
  return oldest === undefined || Date.parse(oldest.at) >= windowStart;
}

export type QuickAction = 'preview' | 'star' | 'share' | 'chat' | 'trash';

export function quickActionsOf(item: DriveItem, writable: boolean): readonly QuickAction[] {
  const file = item.kind !== 'folder';
  return [
    ...(file ? (['preview'] as const) : []),
    'star',
    'share',
    ...(file ? (['chat'] as const) : []),
    ...(writable ? (['trash'] as const) : []),
  ];
}
