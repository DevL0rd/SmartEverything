import type { VacuumPose, VacuumScene } from '@smarteverything/domain';
import { clock } from '../../../../format/time';
import type { IconName } from '../../../../components/icon';
import { describePlan } from '../../../../components/house-map/plan/rooms';
import { houseRobotPose, type UnifiedMap } from '../model/unified-map';
import { vacuumFloor, vacuumRoomRenderId } from '../model/vacuum-scene';

export type StageView = '3d' | 'camera';

export type StageNoteId = 'fault' | 'not_accepted' | 'unreadable' | 'offline' | 'no_webgl';

export type StageNoteTone = 'info' | 'warning' | 'critical' | 'neutral';

export type StageNoteAction = 'retry';

export interface StageNote {
  readonly id: StageNoteId;
  readonly tone: StageNoteTone;
  readonly icon: IconName;
  readonly text: string;
  readonly detail: string | null;
  readonly action: StageNoteAction | null;
}

export interface StageFault {
  readonly title: string;
  readonly hint: string | null;
  readonly canHelp: boolean;
}

export type CardBody = 'loading' | 'empty' | 'unreadable';

export type StageContent =
  | { readonly body: 'map'; readonly scene: VacuumScene }
  | { readonly body: CardBody; readonly scene: null };

export interface StageInput {
  readonly online: boolean;
  readonly webgl: boolean;
  readonly requested: StageView;
  readonly hasMapVersion: boolean;
  readonly scene: VacuumScene | null;
  readonly unreadable: boolean;
  readonly lastSeenAt: string | null;
  readonly timeZone: string | null;
  readonly fault: StageFault | null;
  readonly notAccepted: string | null;
}

export type StagePlan = StageContent & {
  readonly view: StageView;
  readonly views: readonly StageView[];
  readonly live3d: boolean;
  readonly dimmed: boolean;
  readonly notes: readonly StageNote[];
};

export const VIEW_LABELS: Readonly<Record<StageView, string>> = {
  '3d': '3D',
  camera: 'Camera',
};

export const VIEW_SPOKEN: Readonly<Record<StageView, string>> = {
  '3d': 'Show the map in 3D',
  camera: 'Show the robot camera',
};

export const VIEW_ICONS: Readonly<Record<StageView, IconName>> = {
  '3d': 'box',
  camera: 'camera',
};

function contentOf(input: StageInput): StageContent {
  if (input.scene !== null) {
    return { body: 'map', scene: input.scene };
  }
  if (input.unreadable) {
    return { body: 'unreadable', scene: null };
  }
  return { body: input.hasMapVersion ? 'loading' : 'empty', scene: null };
}

const STAGE_VIEWS: readonly StageView[] = ['3d', 'camera'];

export const NO_WEBGL_TEXT = "3D isn't available on this device";

function momentWords(moment: string | null, zone: string | null): string | null {
  return moment === null || Number.isNaN(new Date(moment).getTime()) ? null : clock(moment, zone);
}

function offlineNote(input: StageInput): StageNote {
  const seen = momentWords(input.lastSeenAt, input.timeZone);
  return {
    id: 'offline',
    tone: 'neutral',
    icon: 'wifi',
    text: seen === null ? 'Not reachable' : `Not reachable · last seen ${seen}`,
    detail: null,
    action: null,
  };
}

function unreadableNote(scene: VacuumScene, zone: string | null): StageNote {
  const from = momentWords(scene.fetchedAt, zone);
  return {
    id: 'unreadable',
    tone: 'warning',
    icon: 'warning',
    text: `${from === null ? 'Earlier map' : `Map from ${from}`}. The newer map couldn't be read.`,
    detail: null,
    action: 'retry',
  };
}

function faultNote(fault: StageFault): StageNote {
  return {
    id: 'fault',
    tone: 'critical',
    icon: 'alert',
    text: fault.title,
    detail: fault.hint,
    action: null,
  };
}

function notAcceptedNote(command: string): StageNote {
  return {
    id: 'not_accepted',
    tone: 'warning',
    icon: 'info',
    text: `The robot didn't ${command}. It may have been busy; try again.`,
    detail: null,
    action: null,
  };
}

const NO_WEBGL_NOTE: StageNote = {
  id: 'no_webgl',
  tone: 'info',
  icon: 'info',
  text: NO_WEBGL_TEXT,
  detail: null,
  action: null,
};

function mapNotes(input: StageInput, view: StageView): readonly StageNote[] {
  const { scene } = input;
  return [
    ...(scene !== null && input.unreadable ? [unreadableNote(scene, input.timeZone)] : []),
    ...(input.online ? [] : [offlineNote(input)]),
    ...(scene !== null && view === '3d' && !input.webgl ? [NO_WEBGL_NOTE] : []),
  ];
}

function noteList(input: StageInput, view: StageView): readonly StageNote[] {
  const { fault, notAccepted } = input;
  return [
    ...(fault === null ? [] : [faultNote(fault)]),
    ...(notAccepted === null ? [] : [notAcceptedNote(notAccepted)]),
    ...mapNotes(input, view),
  ];
}

export function planStage(input: StageInput): StagePlan {
  const views = STAGE_VIEWS;
  const view = input.requested;
  const content = contentOf(input);
  const mapShown = content.body === 'map';
  return {
    ...content,
    view,
    views,
    live3d: view === '3d' && mapShown && input.webgl,
    dimmed: !input.online && mapShown,
    notes: view === 'camera' ? [] : noteList(input, view),
  };
}

export function stageStatus(phaseWord: string | null, online: boolean): string | null {
  if (!online) {
    return 'not reachable';
  }
  return phaseWord === null ? null : phaseWord.toLowerCase();
}

export function describeVacuumMap(
  scene: VacuumScene,
  currentRoomId: number | null,
  status: string | null,
): string {
  const floor = vacuumFloor(scene);
  return describePlan(floor, scene.name, vacuumRoomRenderId(scene, floor, currentRoomId), status);
}

export function describeUnifiedMap(
  map: UnifiedMap,
  pose: VacuumPose | null,
  currentRoomId: number | null,
  status: string | null,
): string {
  const { floor } = map;
  const current = currentRoomId === null ? undefined : map.rooms.toHouse.get(currentRoomId);
  const robot = houseRobotPose(map.transform, pose);
  const vacuum = floor.vacuum === null ? null : { ...floor.vacuum, robot };
  return describePlan(
    { rooms: floor.rooms, vacuum },
    map.place.floor.name,
    current ?? null,
    status,
  );
}
