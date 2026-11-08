import type { ReactNode } from 'react';
import {
  ROOM_LABEL_SPOTS,
  boxesMeet,
  ellipsized,
  labelBox,
  placeAtSpots,
  placeLabels,
  type LabelBox,
  type PlacedText,
} from './label-place';
import type { ChromeBox } from '../stage-fit';
import type { ScreenChip, ScreenMarks } from './render-core-marks';
import { underHandles, type YieldZones } from './edit/overlay-model';

const LABEL_FONT_PX = 12;

const LABEL_LIFT_PX = 6;

const ROBOT_REACH_PX = 14;

const ROBOT_RING_PX = 11;

const CHAR_WIDTH_EM = 0.58;

const PILL_PAD_PX = 8;

const PILL_HEIGHT_PX = 22;

const BADGE_PX = 18;

const DOT_SPACE_PX = 10;

const ALL_LABELS_FROM_PX = 280;

const CHIP_FONT_PX = 11;

const CHIP_DOT_PX = 10;

const CHIP_DROP_PX = LABEL_LIFT_PX + PILL_HEIGHT_PX;

const CHIP_PAD_PX = PILL_PAD_PX + CHIP_DOT_PX / 2;

const LABEL_MAX_PX = 170;

const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.5;

const nearPoint = (
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): boolean => near(a.x, b.x) && near(a.y, b.y);

function sameRobot(left: ScreenMarks['robot'], right: ScreenMarks['robot']): boolean {
  if (left === null || right === null) return left === right;
  return nearPoint(left, right);
}

function sameChips(left: readonly ScreenChip[], right: readonly ScreenChip[]): boolean {
  return (
    left.length === right.length &&
    left.every((chip, index) => {
      const other = right[index];
      return other?.text === chip.text && other.tone === chip.tone && nearPoint(chip, other);
    })
  );
}

export function sameMarks(left: ScreenMarks, right: ScreenMarks): boolean {
  if (left.width !== right.width || left.height !== right.height) return false;
  if (!sameRobot(left.robot, right.robot)) return false;
  return (
    left.labels.length === right.labels.length &&
    left.labels.every((label, index) => {
      const other = right.labels[index];
      return other !== undefined && nearPoint(label, other);
    }) &&
    sameChips(left.chips, right.chips)
  );
}

function rank(roomId: string, currentRoomId: string | null): number {
  return roomId === currentRoomId ? 0 : 1;
}

function robotKeepOut(robot: ScreenMarks['robot']): readonly LabelBox[] {
  if (robot === null) return [];
  return [
    {
      left: robot.x - ROBOT_REACH_PX,
      right: robot.x + ROBOT_REACH_PX,
      top: robot.y - ROBOT_REACH_PX,
      bottom: robot.y + ROBOT_REACH_PX,
    },
  ];
}

function chromeKeepOut(chrome: readonly ChromeBox[]): readonly LabelBox[] {
  return chrome.map((box) => ({
    left: box.x,
    right: box.x + box.w,
    top: box.y,
    bottom: box.y + box.h,
  }));
}

interface MarksProps {
  readonly marks: ScreenMarks;
  readonly selection: readonly string[];
  readonly currentRoomId: string | null;
  readonly keepOut: readonly ChromeBox[];
  readonly yieldTo: YieldZones;
}

type PlacedLabel = { readonly roomId: string } & PlacedText;

function labelRoom(order: number, current: boolean): number {
  return LABEL_MAX_PX - PILL_PAD_PX * 2 - (order > 0 ? BADGE_PX : 0) - (current ? DOT_SPACE_PX : 0);
}

function shownName(name: string, order: number, current: boolean): string {
  return ellipsized(name, LABEL_FONT_PX, labelRoom(order, current));
}

function placeRoomLabels(props: MarksProps, blocked: readonly LabelBox[]): readonly PlacedLabel[] {
  const { marks, currentRoomId, selection } = props;
  const wide = marks.width >= ALL_LABELS_FROM_PX;
  const ordered = [...marks.labels]
    .filter((label) => wide || label.roomId === currentRoomId)
    .sort((left, right) => rank(left.roomId, currentRoomId) - rank(right.roomId, currentRoomId));
  return placeAtSpots(
    ordered.map((label) => ({
      roomId: label.roomId,
      x: label.x,
      y: label.y + LABEL_LIFT_PX,
      text: shownName(
        label.name,
        selection.indexOf(label.roomId) + 1,
        label.roomId === currentRoomId,
      ),
    })),
    LABEL_FONT_PX,
    blocked,
    {
      padPx: PILL_PAD_PX,
      bounds: { width: marks.width, height: marks.height },
      spots: ROOM_LABEL_SPOTS,
    },
  );
}

function placeChips(marks: ScreenMarks, blocked: readonly LabelBox[]): readonly ScreenChip[] {
  return placeLabels(
    marks.chips.map((chip) => ({ ...chip, y: chip.y + CHIP_DROP_PX })),
    CHIP_FONT_PX,
    blocked,
    { padPx: CHIP_PAD_PX, bounds: { width: marks.width, height: marks.height } },
  );
}

function chipBoxes(chips: readonly ScreenChip[]): readonly LabelBox[] {
  return chips.map((chip) => labelBox(chip, CHIP_FONT_PX, CHIP_PAD_PX));
}

export function markBoxes(marks: ScreenMarks, withLabels: boolean): readonly LabelBox[] {
  const chips = chipBoxes(marks.chips.map((chip) => ({ ...chip, y: chip.y + CHIP_DROP_PX })));
  if (!withLabels) return chips;
  const labels = marks.labels.map((label) =>
    labelBox(
      {
        x: label.x,
        y: label.y + LABEL_LIFT_PX,
        text: ellipsized(label.name, LABEL_FONT_PX, labelRoom(0, false)),
      },
      LABEL_FONT_PX,
      PILL_PAD_PX,
    ),
  );
  return [...chips, ...labels];
}

interface YieldedChip {
  readonly chip: ScreenChip;
  readonly faded: boolean;
}

function giveWay(
  zones: YieldZones,
  labels: readonly PlacedLabel[],
  chips: readonly ScreenChip[],
): { readonly labels: readonly PlacedLabel[]; readonly chips: readonly YieldedChip[] } {
  const shown = zones.hideLabels
    ? []
    : labels.filter((label) => !underHandles(zones, labelBox(label, LABEL_FONT_PX, PILL_PAD_PX)));
  const yielded = chips.flatMap((chip) => {
    const under = underHandles(zones, labelBox(chip, CHIP_FONT_PX, PILL_PAD_PX));
    if (under && zones.chips === 'hide') return [];
    return [{ chip, faded: under }];
  });
  return { labels: shown, chips: yielded };
}

export function placedMarks(props: MarksProps): {
  readonly labels: readonly PlacedLabel[];
  readonly chips: readonly YieldedChip[];
} {
  const { marks, keepOut } = props;
  const blocked = [...robotKeepOut(marks.robot), ...chromeKeepOut(keepOut)];
  const placedChips = placeChips(marks, blocked);
  const room = placeRoomLabels(props, [...blocked, ...chipBoxes(placedChips)]);
  return giveWay(props.yieldTo, room, placedChips);
}

export function Marks(props: MarksProps): ReactNode {
  const { marks, selection, currentRoomId } = props;
  const { labels: placed, chips } = placedMarks(props);
  return (
    <svg className="vacuum-map3d-marks" aria-hidden="true">
      {marks.robot === null ? null : (
        <g transform={`translate(${marks.robot.x.toFixed(1)} ${marks.robot.y.toFixed(1)})`}>
          <circle className="vacuum-map3d-robot-halo" r={ROBOT_REACH_PX} />
          <circle className="vacuum-map3d-robot" r={ROBOT_RING_PX} />
        </g>
      )}
      {placed.map((label) => (
        <Pill
          key={label.roomId}
          label={label}
          order={selection.indexOf(label.roomId) + 1}
          current={label.roomId === currentRoomId}
        />
      ))}
      {chips.map(({ chip, faded }) => (
        <Chip key={`chip:${chip.roomId}`} chip={chip} faded={faded} />
      ))}
    </svg>
  );
}

function Pill({
  label,
  order,
  current,
}: {
  readonly label: { readonly x: number; readonly y: number; readonly text: string };
  readonly order: number;
  readonly current: boolean;
}): ReactNode {
  const width = label.text.length * LABEL_FONT_PX * CHAR_WIDTH_EM + PILL_PAD_PX * 2;
  const lead = order > 0 ? BADGE_PX : 0;
  const tail = current ? DOT_SPACE_PX : 0;
  const total = width + lead + tail;
  const left = -total / 2;
  return (
    <g transform={`translate(${label.x.toFixed(1)} ${(label.y - LABEL_FONT_PX / 2).toFixed(1)})`}>
      <rect
        className="vacuum-map3d-pill"
        x={left}
        y={-PILL_HEIGHT_PX / 2}
        width={total}
        height={PILL_HEIGHT_PX}
        rx={PILL_HEIGHT_PX / 2}
      />
      {order > 0 ? (
        <g transform={`translate(${(left + PILL_PAD_PX + BADGE_PX / 2 - 2).toFixed(1)} 0)`}>
          <circle className="vacuum-map3d-badge" r={BADGE_PX / 2 - 1} />
          <text className="vacuum-map3d-badge-text" textAnchor="middle" dy="4">
            {String(order)}
          </text>
        </g>
      ) : null}
      <text
        className="vacuum-map3d-text"
        x={left + PILL_PAD_PX + lead + (width - PILL_PAD_PX * 2) / 2}
        textAnchor="middle"
        dy="4"
      >
        {label.text}
      </text>
      {current ? (
        <circle className="vacuum-map3d-now" cx={left + total - PILL_PAD_PX - 2} r={3} />
      ) : null}
    </g>
  );
}

function Chip({ chip, faded }: { readonly chip: ScreenChip; readonly faded: boolean }): ReactNode {
  const width = chip.text.length * CHIP_FONT_PX * CHAR_WIDTH_EM + PILL_PAD_PX * 2 + CHIP_DOT_PX;
  const left = -width / 2;
  return (
    <g
      className={faded ? 'vacuum-map3d-chip-faded' : undefined}
      transform={`translate(${chip.x.toFixed(1)} ${(chip.y - CHIP_FONT_PX / 2).toFixed(1)})`}
    >
      <rect
        className="vacuum-map3d-pill"
        x={left}
        y={-PILL_HEIGHT_PX / 2}
        width={width}
        height={PILL_HEIGHT_PX}
        rx={PILL_HEIGHT_PX / 2}
      />
      <circle
        className="vacuum-map3d-chip-dot"
        data-tone={chip.tone}
        cx={left + PILL_PAD_PX + 3}
        r={3}
      />
      <text className="vacuum-map3d-chip-text" x={left + PILL_PAD_PX + CHIP_DOT_PX} dy="4">
        {chip.text}
      </text>
    </g>
  );
}

export const DENSE_PX_PER_METRE = 45;

export const DEVICE_DOT_PX = 9;

export const DEVICE_DOT_HIT_PX = 44;

export interface ScreenDevice {
  readonly id: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface DeviceFocus {
  readonly selection: readonly string[];
  readonly hovered: string | null;
}

export interface DeviceMark extends ScreenDevice {
  readonly dot: boolean;
}

export function deviceMarks(
  devices: readonly ScreenDevice[],
  pxPerMetre: number,
  focus: DeviceFocus,
): readonly DeviceMark[] {
  const boxes = devices.map((device) => labelBox(device, CHIP_FONT_PX, CHIP_PAD_PX));
  return devices.map((device, index) => {
    const own = boxes[index];
    const focused = focus.selection.includes(device.id) || focus.hovered === device.id;
    const crowded =
      own !== undefined && boxes.some((box, other) => other !== index && boxesMeet(box, own));
    return { ...device, dot: pxPerMetre < DENSE_PX_PER_METRE && crowded && !focused };
  });
}

export function nearestDevice(
  marks: readonly DeviceMark[],
  at: { readonly x: number; readonly y: number },
): string | null {
  let best: { readonly id: string; readonly gap: number } | null = null;
  for (const mark of marks) {
    const gap = Math.hypot(mark.x - at.x, mark.y - at.y);
    if (gap <= DEVICE_DOT_HIT_PX / 2 && (best === null || gap < best.gap)) {
      best = { id: mark.id, gap };
    }
  }
  return best?.id ?? null;
}

export function DeviceMarks({ marks }: { readonly marks: readonly DeviceMark[] }): ReactNode {
  return (
    <g>
      {marks.map((mark) =>
        mark.dot ? (
          <circle
            key={`device:${mark.id}`}
            className="vacuum-map3d-chip-dot"
            data-tone="warning"
            cx={mark.x}
            cy={mark.y}
            r={DEVICE_DOT_PX / 2}
          />
        ) : (
          <Chip
            key={`device:${mark.id}`}
            chip={{ roomId: mark.id, text: mark.text, tone: 'warning', x: mark.x, y: mark.y }}
            faded={false}
          />
        ),
      )}
    </g>
  );
}
