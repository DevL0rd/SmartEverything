import type { ReactNode } from 'react';
import type { z } from 'zod';
import type {
  BoardClass,
  BoardLayout,
  BoardWidget,
  DeviceGroupRow,
  DeviceRow,
  RoomRow,
  WidgetSize,
} from '@smarteverything/domain';
import type { IconName } from '../icon';
import type { WidgetFrameBox } from './frame-class';

export type { BoardClass, BoardWidget, WidgetSize } from '@smarteverything/domain';

export interface WidgetRenderProps {
  readonly size: WidgetSize;
  readonly options: BoardWidget['options'];
  readonly editing: boolean;
  readonly frame: WidgetFrameBox;
}

export interface PickerState {
  readonly devices: readonly DeviceRow[];
  readonly rooms: readonly RoomRow[];
  readonly groups: readonly DeviceGroupRow[];
}

export interface TargetRow {
  readonly key: string;
  readonly title: string;
  readonly subtitle: string;
  readonly options: NonNullable<BoardWidget['options']>;
  readonly note?: string;
}

export interface TargetSection {
  readonly title: string;
  readonly rows: readonly TargetRow[];
}

export interface TargetPicker {
  readonly title: string;
  readonly sections: (
    state: PickerState,
    placed: readonly BoardWidget[],
  ) => readonly TargetSection[];
  readonly suggestions?: (state: PickerState) => readonly TargetRow[];
}

export interface GalleryEntry {
  readonly title: string;
  readonly subtitle: string;
  readonly icon: IconName;
  readonly group: string;
  readonly pick?: TargetPicker;
  readonly defaultSize?: WidgetSize;
}

interface InstanceOptions<T> {
  readonly schema: z.ZodType<T>;
  readonly editor: (props: {
    readonly value: T;
    readonly onChange: (value: T) => void;
  }) => ReactNode;
}

export interface WidgetDefinition {
  readonly type: string;
  readonly title: string;
  readonly icon: IconName;
  readonly group?: string;
  readonly aspect?: number;
  readonly rows?: Readonly<
    Partial<Record<BoardClass, Readonly<Partial<Record<WidgetSize, number>>>>>
  >;
  readonly sizes: Readonly<Record<BoardClass, readonly WidgetSize[]>>;
  readonly defaultSize: WidgetSize;
  readonly instanceOptions?: InstanceOptions<unknown>;
  readonly optionsLabel?: (options: BoardWidget['options']) => string;
  readonly entries?: readonly GalleryEntry[];
  readonly preview?: (frame: WidgetFrameBox, options: unknown) => ReactNode;
  readonly render: (props: WidgetRenderProps) => ReactNode;
  readonly skeleton?: () => ReactNode;
}

export type BoardDefaults = Readonly<Record<BoardClass, readonly BoardWidget[]>>;

export type BoardLayoutState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly layout: BoardLayout | null }
  | { readonly status: 'invalid'; readonly reason: string; readonly reset: () => void };
