import type {
  VacuumCleaningCommand,
  VacuumCleanSummary,
  VacuumPhase,
} from '@smarteverything/domain';
import type { FrameClass } from '../../../components/widget-board';
import type { IconName } from '../../../components/icon';
import { duration, moment } from '../../../format/time';
import type { StageView } from './components/map-view-model';

export type FaceLayout = 'tile' | 'row' | 'stack' | 'side';

const LAYOUTS: Readonly<Record<FrameClass, FaceLayout>> = {
  xs: 'row',
  s: 'tile',
  m: 'row',
  w: 'row',
  l: 'stack',
  xl: 'side',
};

export function layoutOf(cls: FrameClass): FaceLayout {
  return LAYOUTS[cls];
}

export interface FaceAction {
  readonly id: 'start' | 'pause' | 'resume' | 'dock';
  readonly label: string;
  readonly spoken: string;
  readonly icon: IconName;
  readonly command: VacuumCleaningCommand;
}

export interface FaceActions {
  readonly primary: FaceAction | null;
  readonly dock: FaceAction | null;
  readonly cleanRooms: boolean;
}

const START: readonly VacuumPhase[] = ['idle', 'docked_full', 'charging'];

const PAUSE: readonly VacuumPhase[] = ['cleaning', 'mopping', 'mapping'];

const RESUME: readonly VacuumPhase[] = ['paused', 'mapping_paused'];

const DOCKABLE: readonly VacuumPhase[] = ['cleaning', 'mopping', 'paused', 'error'];

const PAUSE_ACTION: FaceAction = {
  id: 'pause',
  label: 'Pause',
  spoken: 'Pause cleaning',
  icon: 'pause',
  command: 'pause',
};

const RESUME_ACTION: FaceAction = {
  id: 'resume',
  label: 'Resume',
  spoken: 'Resume cleaning',
  icon: 'play',
  command: 'resume',
};

const DOCK_ACTION: FaceAction = {
  id: 'dock',
  label: 'Dock',
  spoken: 'Send the robot back to its dock',
  icon: 'home',
  command: 'dock',
};

function startAction(rooms: number): FaceAction {
  const word = rooms === 1 ? 'room' : 'rooms';
  return {
    id: 'start',
    label: rooms === 0 ? 'Start' : `Clean ${String(rooms)} ${word}`,
    spoken: rooms === 0 ? 'Start cleaning' : `Clean ${String(rooms)} selected ${word}`,
    icon: 'play',
    command: 'start',
  };
}

function primaryOf(phase: VacuumPhase, rooms: number): FaceAction | null {
  if (START.includes(phase)) {
    return startAction(rooms);
  }
  if (PAUSE.includes(phase)) {
    return PAUSE_ACTION;
  }
  return RESUME.includes(phase) ? RESUME_ACTION : null;
}

export function actionsOf(
  phase: VacuumPhase | null,
  online: boolean,
  selectedRooms: number,
): FaceActions {
  if (!online || phase === null) {
    return { primary: null, dock: null, cleanRooms: false };
  }
  const primary = primaryOf(phase, selectedRooms);
  return {
    primary,
    dock: DOCKABLE.includes(phase) ? DOCK_ACTION : null,
    cleanRooms: primary?.id === 'start' && selectedRooms > 0,
  };
}

export interface StageGate {
  readonly visible: boolean;
  readonly focused: boolean;
  readonly foreground: boolean;
}

export type FaceMount = '3d' | 'still';

function isLive(gate: StageGate): boolean {
  return gate.visible && gate.focused && gate.foreground;
}

export function mountedView(gate: StageGate): FaceMount {
  return isLive(gate) ? '3d' : 'still';
}

export function cameraLive(option: StageView, tapped: boolean, gate: StageGate): boolean {
  return option === 'camera' && tapped && isLive(gate);
}

export function lastCleanLine(
  clean: Pick<VacuumCleanSummary, 'startedAt' | 'areaM2' | 'seconds'> | null,
  now: number,
  timeZone: string | null,
): string | null {
  if (clean === null) {
    return null;
  }
  return [
    `Last clean ${moment(clean.startedAt, now, timeZone)}`,
    `${String(Math.round(clean.areaM2))} m²`,
    duration(clean.seconds),
  ].join(' · ');
}

export function batteryText(battery: number | null): string | null {
  return battery === null ? null : `${String(Math.round(battery))}%`;
}

export interface FaceTile {
  readonly label: string;
  readonly value: string;
}

export interface WornPart {
  readonly label: string;
  readonly lifePercent: number;
}

export interface TileInput {
  readonly awake: boolean;
  readonly doneAreaM2: number | null;
  readonly elapsedSeconds: number | null;
  readonly nextClean: string | null;
  readonly worn: WornPart | null;
}

function tile(label: string, value: string | null): readonly FaceTile[] {
  return value === null ? [] : [{ label, value }];
}

export function faceTiles(input: TileInput): readonly FaceTile[] {
  if (input.awake) {
    return [
      ...tile(
        'Area',
        input.doneAreaM2 === null ? null : `${String(Math.round(input.doneAreaM2))} m²`,
      ),
      ...tile('Time', input.elapsedSeconds === null ? null : duration(input.elapsedSeconds)),
    ];
  }
  const { worn } = input;
  return [
    ...tile('Next clean', input.nextClean),
    ...tile(
      worn === null ? 'Parts' : worn.label,
      worn === null ? null : `${String(Math.round(worn.lifePercent))}% left`,
    ),
  ];
}

export function mostWorn(
  parts: readonly { readonly label: string; readonly lifePercent: number | null }[],
): WornPart | null {
  return parts.reduce<WornPart | null>((lowest, part) => {
    const { lifePercent } = part;
    if (lifePercent === null || (lowest !== null && lowest.lifePercent <= lifePercent)) {
      return lowest;
    }
    return { label: part.label, lifePercent };
  }, null);
}

export function faceProgress(
  awake: boolean,
  stationProgress: number | null,
  jobProgress: number | null,
): number | null {
  const percent = stationProgress === null ? (awake ? jobProgress : null) : stationProgress * 100;
  return percent === null ? null : Math.min(1, Math.max(0, percent / 100));
}

export function awakeDetail(title: string | null, elapsedSeconds: number | null): string | null {
  const parts = [title, elapsedSeconds === null ? null : duration(elapsedSeconds)].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? null : parts.join(' · ');
}
