import type { ReactNode } from 'react';
import type { z } from 'zod';
import type { BoardClass, BoardLayout, BoardWidget, WidgetSize } from '@smarteverything/domain';
import type { IconName } from '../icon';

export type { BoardClass, BoardWidget, WidgetSize } from '@smarteverything/domain';

export interface WidgetRenderProps {
  readonly size: WidgetSize;
  readonly options: BoardWidget['options'];
  readonly editing: boolean;
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
  readonly sizes: Readonly<Record<BoardClass, readonly WidgetSize[]>>;
  readonly defaultSize: WidgetSize;
  readonly instanceOptions?: InstanceOptions<unknown>;
  readonly render: (props: WidgetRenderProps) => ReactNode;
  readonly skeleton?: () => ReactNode;
}

export type BoardDefaults = Readonly<Record<BoardClass, readonly BoardWidget[]>>;

export type BoardLayoutState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly layout: BoardLayout | null }
  | { readonly status: 'invalid'; readonly reason: string; readonly reset: () => void };
