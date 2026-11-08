import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon, type IconName } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import type { Tone } from '../../../../components/tone';
import { cn } from '../../../../design/cn';
import type { GizmoMode, GizmoSpace } from '../tool-state';
import { subOf, type SubChoice, type SubmenuId } from './menu-model';
import { ModeSwitch, SNAP_LABEL, axesLabel } from './mode-switch';
import type { ObjectAction, ObjectActionId } from './object-actions';

export const CLEAR_LABEL = 'Clear selection';

export const MORE_LABEL = 'More';

const SUB_LABEL: Readonly<Record<SubmenuId, string>> = {
  style: 'Style',
  move: 'Move to',
};

export interface BarGizmo {
  readonly mode: GizmoMode;
  readonly modes: readonly GizmoMode[];
  readonly space: GizmoSpace;
  readonly snapping: boolean;
  readonly disabled: boolean;
  readonly onMode: (mode: GizmoMode) => void;
  readonly onSnapping: () => void;
  readonly onSpace: () => void;
}

export interface ContextualBarProps {
  readonly title: string;
  readonly locked: boolean;
  readonly gizmo: BarGizmo;
  readonly actions: readonly ObjectAction[];
  readonly rooms: readonly SubChoice[];
  readonly looks: readonly SubChoice[];
  readonly onAction: (id: Exclude<ObjectActionId, SubmenuId>) => void;
  readonly onRoom: (key: string) => void;
  readonly onLook: (key: string) => void;
  readonly onClear: () => void;
}

interface BarButtonProps {
  readonly icon: IconName;
  readonly label: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly expanded?: boolean;
  readonly onPress: () => void;
}

function BarButton({ icon, label, on, disabled, expanded, onPress }: BarButtonProps): ReactNode {
  return (
    <Interactive
      label={label}
      selected={on}
      expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      onTone={on ? 'primary' : 'surface'}
      className={cn(
        'h-14 w-12 shrink-0 items-center justify-center rounded-md',
        on ? 'bg-primary' : '',
      )}
      layerClassName="rounded-md"
    >
      <Icon name={icon} size={24} tone={on ? 'onPrimary' : 'default'} />
    </Interactive>
  );
}

interface RowLook {
  readonly icon: IconName;
  readonly label: string;
  readonly tone: Tone;
  readonly amber: boolean;
}

function lookOf(action: ObjectAction, locked: boolean): RowLook {
  const unlock = action.id === 'lock' && locked;
  const tone: Tone = action.destructive ? 'critical' : unlock ? 'onPrimaryContainer' : 'default';
  const label = action.submenu ? `${action.label} ›` : action.label;
  return { icon: action.icon, label, tone, amber: unlock };
}

interface ListRowProps {
  readonly look: RowLook;
  readonly disabled: boolean;
  readonly open?: boolean;
  readonly onPress: () => void;
}

function ListRow({ look, disabled, open, onPress }: ListRowProps): ReactNode {
  return (
    <View className="w-1/2 p-0.5">
      <Interactive
        label={look.label}
        disabled={disabled}
        expanded={open}
        selected={open}
        onPress={onPress}
        className={cn(
          'min-h-11 flex-row items-center gap-2 rounded-sm px-3',
          look.amber ? 'bg-primary-container' : open === true ? 'bg-surface-3' : 'bg-surface',
        )}
        layerClassName="rounded-sm"
      >
        <Icon name={look.icon} size={20} tone={look.tone} />
        <Text variant="body" tone={look.tone} numberOfLines={1} className="min-w-0 flex-1">
          {look.label}
        </Text>
      </Interactive>
    </View>
  );
}

function ChoiceRow({
  sub,
  choices,
  onPick,
}: {
  readonly sub: SubmenuId;
  readonly choices: readonly SubChoice[];
  readonly onPick: (key: string) => void;
}): ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={SUB_LABEL[sub]}
      contentContainerClassName="gap-2 px-1"
      keyboardShouldPersistTaps="handled"
    >
      {choices.map((choice) => (
        <Interactive
          key={choice.key}
          label={choice.label}
          role="button"
          selected={choice.on}
          onPress={(): void => {
            onPick(choice.key);
          }}
          className={cn(
            'min-h-touch-min flex-row items-center gap-1.5 rounded-full border-hairline px-4',
            choice.on ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface',
          )}
          layerClassName="rounded-full"
        >
          {choice.on ? <Icon name="check" size={16} tone="primary" /> : null}
          <Text variant="footnote" numberOfLines={1}>
            {choice.label}
          </Text>
        </Interactive>
      ))}
    </ScrollView>
  );
}

interface MoreListProps {
  readonly owner: ContextualBarProps;
  readonly open: SubmenuId | null;
  readonly onOpen: (sub: SubmenuId | null) => void;
}

function MoreList({ owner, open, onOpen }: MoreListProps): ReactNode {
  const { gizmo, actions, locked, onAction } = owner;
  const axes: RowLook = {
    icon: gizmo.space === 'world' ? 'globe' : 'box',
    label: axesLabel(gizmo.space),
    tone: 'default',
    amber: false,
  };
  return (
    <View
      accessibilityRole="menu"
      accessibilityLabel={`More for ${owner.title}`}
      className="flex-row flex-wrap"
    >
      <ListRow look={axes} disabled={gizmo.disabled} onPress={gizmo.onSpace} />
      {actions.map((action) => {
        const sub = subOf(action);
        return (
          <ListRow
            key={action.id}
            look={lookOf(action, locked)}
            disabled={action.disabled}
            {...(sub === null ? {} : { open: open === sub })}
            onPress={(): void => {
              if (sub !== null) onOpen(open === sub ? null : sub);
              else if (action.id !== 'style' && action.id !== 'move') onAction(action.id);
            }}
          />
        );
      })}
    </View>
  );
}

interface BarRowProps {
  readonly title: string;
  readonly gizmo: BarGizmo;
  readonly more: boolean;
  readonly onMore: () => void;
  readonly onClear: () => void;
}

function BarRow({ title, gizmo, more, onMore, onClear }: BarRowProps): ReactNode {
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={`Actions for ${title}`}
      className="flex-row items-center gap-1"
    >
      <BarButton icon="close" label={CLEAR_LABEL} on={false} disabled={false} onPress={onClear} />
      <ModeSwitch
        mode={gizmo.mode}
        modes={gizmo.disabled ? [] : gizmo.modes}
        space={gizmo.space}
        look="bar"
        onMode={gizmo.onMode}
      />
      <BarButton
        icon="grid"
        label={SNAP_LABEL}
        on={gizmo.snapping}
        disabled={gizmo.disabled}
        onPress={gizmo.onSnapping}
      />
      <BarButton
        icon="ellipsis"
        label={MORE_LABEL}
        on={false}
        disabled={false}
        expanded={more}
        onPress={onMore}
      />
    </View>
  );
}

export function ContextualBar(props: ContextualBarProps): ReactNode {
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<SubmenuId | null>(null);
  const choices = open === 'move' ? props.rooms : props.looks;
  const pick = (key: string): void => {
    setOpen(null);
    if (open === 'move') props.onRoom(key);
    else props.onLook(key);
  };
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-1">
      <BarRow
        title={props.title}
        gizmo={props.gizmo}
        more={more}
        onClear={props.onClear}
        onMore={(): void => {
          setMore(!more);
          setOpen(null);
        }}
      />
      {more ? <MoreList owner={props} open={open} onOpen={setOpen} /> : null}
      {more && open !== null ? <ChoiceRow sub={open} choices={choices} onPick={pick} /> : null}
    </View>
  );
}
