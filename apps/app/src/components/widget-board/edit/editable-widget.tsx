import type { ReactNode } from 'react';
import { Pressable, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { WidgetSize } from '@smarteverything/domain';
import { useAnimationGate } from '../../../design/animation-gate';
import { cn } from '../../../design/cn';
import type { Cell, Frame } from '../board-geometry';
import { frameBoxOf } from '../frame-class';
import { renderWidget } from '../widget-scope';
import type { BoardWidget, WidgetDefinition } from '../types';
import type { DragState } from './drag-state';
import { SIZE_LABELS, type SizeOption } from './edit-model';
import { useResizeGesture } from './use-resize-gesture';
import { useJiggle, useMoveGesture, useWidgetMotion, useWidgetStyle } from './use-widget-motion';
import { CornerButton, ResizeHandle, SizeLabel } from './widget-chrome';

export type WidgetCommand = 'earlier' | 'later' | 'bigger' | 'smaller' | 'remove';

export interface WidgetHandlers {
  readonly lift: (key: string) => void;
  readonly drop: () => void;
  readonly resizeStart: (key: string) => void;
  readonly resizeTo: (key: string, size: WidgetSize) => void;
  readonly resizeEnd: () => void;
  readonly command: (key: string, command: WidgetCommand) => void;
  readonly openOptions: (key: string) => void;
  readonly focus: (key: string | null) => void;
}

export interface EditableWidgetProps {
  readonly widget: BoardWidget;
  readonly definition: WidgetDefinition;
  readonly frame: Frame;
  readonly cell: Cell;
  readonly order: number;
  readonly sizes: readonly SizeOption[];
  readonly drag: DragState;
  readonly handlers: WidgetHandlers;
  readonly touch: boolean;
  readonly reduced: boolean;
  readonly lifted: boolean;
  readonly resizing: boolean;
  readonly picked: boolean;
}

const ACTIONS = [
  { name: 'earlier', label: 'Move earlier' },
  { name: 'later', label: 'Move later' },
  { name: 'bigger', label: 'Make bigger' },
  { name: 'smaller', label: 'Make smaller' },
  { name: 'remove', label: 'Remove' },
] as const;

function isCommand(name: string): name is WidgetCommand {
  return ACTIONS.some((action) => action.name === name);
}

function Body(props: EditableWidgetProps): ReactNode {
  const { widget, definition, handlers, touch, picked, lifted, reduced, frame, cell } = props;
  const label = `${definition.title}, ${SIZE_LABELS[widget.size]}`;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityHint={
        touch ? 'Hold and drag to move' : 'Drag to move, or press Space to pick up'
      }
      accessibilityActions={ACTIONS}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        const name = event.nativeEvent.actionName;
        if (isCommand(name)) {
          handlers.command(widget.key, name);
        }
      }}
      onFocus={() => {
        handlers.focus(widget.key);
      }}
      onBlur={() => {
        handlers.focus(null);
      }}
      className={cn(
        'h-full rounded-lg focus:outline-2 focus:outline-offset-2 focus:outline-focus',
        touch ? '' : 'cursor-grab',
        lifted && 'elevation-2',
        reduced && 'border-2 border-dashed border-outline',
        picked && 'border-2 border-primary',
      )}
    >
      <View pointerEvents="none" className="h-full">
        {renderWidget(
          definition,
          {
            size: widget.size,
            options: widget.options,
            editing: true,
            frame: frameBoxOf(frame, cell.pad, touch ? 'touch' : 'pointer'),
          },
          null,
        )}
      </View>
    </Pressable>
  );
}

function Chrome({
  widget,
  definition,
  sizes,
  handlers,
  resize,
  resizing,
}: Pick<EditableWidgetProps, 'widget' | 'definition' | 'sizes' | 'handlers' | 'resizing'> & {
  readonly resize: PanGesture;
}): ReactNode {
  return (
    <>
      {resizing ? <SizeLabel label={SIZE_LABELS[widget.size]} /> : null}
      <CornerButton
        corner="top-left"
        icon="minus"
        label={`Remove ${definition.title}`}
        onPress={() => {
          handlers.command(widget.key, 'remove');
        }}
      />
      {definition.instanceOptions === undefined ? null : (
        <CornerButton
          corner="top-right"
          icon="settings"
          label={definition.optionsLabel?.(widget.options) ?? `${definition.title} options`}
          onPress={() => {
            handlers.openOptions(widget.key);
          }}
        />
      )}
      {sizes.length > 1 ? (
        <ResizeHandle gesture={resize} label={`Resize ${definition.title}`} />
      ) : null}
    </>
  );
}

export function EditableWidget(props: EditableWidgetProps): ReactNode {
  const { widget, frame, cell, order, sizes, drag, handlers, touch, reduced } = props;
  const motion = useWidgetMotion(frame, reduced);
  const jiggling = useAnimationGate(!reduced && !props.resizing, true).moving;
  const rotation = useJiggle(jiggling, order);
  const style = useWidgetStyle(widget.key, motion, drag, rotation);
  const move = useMoveGesture({
    key: widget.key,
    touch,
    motion,
    drag,
    onLift: handlers.lift,
    onDrop: handlers.drop,
  });
  const resize = useResizeGesture({
    key: widget.key,
    size: widget.size,
    options: sizes,
    cell,
    motion,
    onStart: handlers.resizeStart,
    onSize: handlers.resizeTo,
    onEnd: handlers.resizeEnd,
  });
  return (
    <Animated.View style={style} className="absolute">
      <GestureDetector gesture={move}>
        <View className="h-full">
          <Body {...props} />
        </View>
      </GestureDetector>
      <Chrome {...props} resize={resize} />
    </Animated.View>
  );
}
