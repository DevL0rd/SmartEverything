import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import type { Tone } from '../../../../components/tone';
import { cn } from '../../../../design/cn';
import { entering, useMotion } from '../../../../design/motion';
import { isNative, useIdiom } from '../../../../design/platform';
import {
  MENU_PAD_PX,
  MENU_START,
  MENU_WIDTH_PX,
  menuHeight,
  menuKey,
  menuRowPx,
  modeRowHeight,
  placeMenu,
  placeSubmenu,
  subOf,
  submenuWidthPx,
  type MenuFocus,
  type StageRect,
  type StageSize,
  type SubChoice,
  type SubmenuId,
} from './menu-model';
import { ModeSwitch } from './mode-switch';
import { useDocumentKeys } from './document-keys';
import type { ObjectAction, ObjectActionId } from './object-actions';
import type { GizmoMode, GizmoSpace } from '../tool-state';

export type { StageRect, StageSize, SubChoice, SubmenuId } from './menu-model';

function useCloseOnBlur(onClose: () => void): void {
  const run = useEffectEvent(onClose);
  useEffect(() => {
    if (isNative()) return undefined;
    const blur = (): void => {
      run();
    };
    window.addEventListener('blur', blur);
    return (): void => {
      window.removeEventListener('blur', blur);
    };
  }, []);
}

type RowLook = 'plain' | 'danger' | 'amber';

interface RowProps {
  readonly label: string;
  readonly icon: ObjectAction['icon'] | null;
  readonly trailing: ReactNode;
  readonly look: RowLook;
  readonly disabled: boolean;
  readonly highlighted: boolean;
  readonly checked: boolean | undefined;
  readonly expanded: boolean | undefined;
  readonly touch: boolean;
  readonly onPress: () => void;
}

const ROW_TONE: Readonly<Record<RowLook, { readonly text: Tone; readonly icon: Tone }>> = {
  plain: { text: 'default', icon: 'variant' },
  danger: { text: 'critical', icon: 'critical' },
  amber: { text: 'onPrimaryContainer', icon: 'onPrimaryContainer' },
};

const ROW_FILL: Readonly<Record<RowLook, { readonly rest: string; readonly lit: string }>> = {
  plain: { rest: '', lit: 'bg-surface-2' },
  danger: { rest: '', lit: 'bg-critical/10' },
  amber: { rest: 'bg-primary-container', lit: 'bg-primary-container' },
};

function Row(props: RowProps): ReactNode {
  const tone = ROW_TONE[props.look];
  const fill = ROW_FILL[props.look];
  return (
    <Interactive
      role="menuitem"
      label={props.label}
      disabled={props.disabled}
      checked={props.checked}
      expanded={props.expanded}
      onPress={props.onPress}
      className={cn(
        'mx-1 flex-row items-center gap-3 rounded-sm px-3',
        props.touch ? 'min-h-touch-min' : 'min-h-9',
        props.highlighted ? fill.lit : fill.rest,
      )}
      layerClassName="rounded-sm"
    >
      {props.icon === null ? null : (
        <Icon name={props.icon} size={props.touch ? 20 : 16} tone={tone.icon} />
      )}
      <Text variant="body" tone={tone.text} numberOfLines={1} className="min-w-0 flex-1">
        {props.label}
      </Text>
      {props.trailing}
    </Interactive>
  );
}

function Trailing({
  action,
  touch,
}: {
  readonly action: ObjectAction;
  readonly touch: boolean;
}): ReactNode {
  if (action.submenu) return <Icon name="chevronRight" size={16} tone="faint" />;
  if (action.shortcut === null || touch) return null;
  return (
    <Text variant="caption" tone="faint">
      {action.shortcut}
    </Text>
  );
}

interface PanelProps {
  readonly label: string;
  readonly rect: StageRect;
  readonly children: ReactNode;
}

function Panel({ label, rect, children }: PanelProps): ReactNode {
  const motion = useMotion();
  const frame = { left: rect.x, top: rect.y, width: rect.width };
  return (
    <Animated.View
      {...entering(motion, FadeIn.duration(150))}
      accessibilityRole="menu"
      accessibilityLabel={label}
      style={frame}
      className="absolute rounded-md border-hairline border-outline-variant bg-surface-raised py-1 elevation-2"
    >
      {children}
    </Animated.View>
  );
}

export interface MenuGizmo {
  readonly mode: GizmoMode;
  readonly modes: readonly GizmoMode[];
  readonly space: GizmoSpace;
  readonly onMode: (mode: GizmoMode) => void;
}

export interface ObjectContextMenuProps {
  readonly title: string;
  readonly gizmo: MenuGizmo | null;
  readonly locked: boolean;
  readonly object: StageRect;
  readonly stage: StageSize;
  readonly actions: readonly ObjectAction[];
  readonly rooms: readonly SubChoice[];
  readonly looks: readonly SubChoice[];
  readonly onAction: (id: Exclude<ObjectActionId, SubmenuId>) => void;
  readonly onRoom: (key: string) => void;
  readonly onLook: (key: string) => void;
  readonly onClose: () => void;
}

const SUB_TITLE: Readonly<Record<SubmenuId, string>> = {
  style: 'Colour and style',
  move: 'Move to another room',
};

function choicesOf(props: ObjectContextMenuProps, sub: SubmenuId): readonly SubChoice[] {
  return sub === 'move' ? props.rooms : props.looks;
}

function pickChoice(props: ObjectContextMenuProps, sub: SubmenuId, key: string): void {
  props.onClose();
  if (sub === 'move') props.onRoom(key);
  else props.onLook(key);
}

function runAction(props: ObjectContextMenuProps, action: ObjectAction): void {
  if (action.id === 'style' || action.id === 'move') return;
  props.onClose();
  props.onAction(action.id);
}

function useMenuKeys(props: ObjectContextMenuProps): [MenuFocus, (focus: MenuFocus) => void] {
  const [focus, setFocus] = useState<MenuFocus>(MENU_START);
  useCloseOnBlur(props.onClose);
  useDocumentKeys(true, (press) => {
    const step = menuKey(focus, press.key, props.actions, (sub) => choicesOf(props, sub).length);
    setFocus(step.focus);
    const { effect } = step;
    if (effect.kind === 'close') props.onClose();
    if (effect.kind === 'choose') {
      const choice = choicesOf(props, effect.sub)[effect.index];
      if (choice !== undefined) pickChoice(props, effect.sub, choice.key);
    }
    if (effect.kind === 'action') {
      const action = props.actions.find((item) => item.id === effect.id);
      if (action !== undefined) runAction(props, action);
    }
    return true;
  });
  return [focus, setFocus];
}

interface SubmenuProps {
  readonly owner: ObjectContextMenuProps;
  readonly focus: MenuFocus;
  readonly menu: StageRect;
  readonly sub: SubmenuId;
  readonly touch: boolean;
}

function Submenu({ owner, focus, menu, sub, touch }: SubmenuProps): ReactNode {
  const choices = choicesOf(owner, sub);
  const index = owner.actions.findIndex((action) => action.id === sub);
  const header = modeRowHeight(owner.gizmo !== null);
  const rowY = menu.y + MENU_PAD_PX + header + Math.max(index, 0) * menuRowPx(touch);
  const shape = { rows: choices.length, dividers: 0, header: 0 };
  const size = { width: submenuWidthPx(touch), height: menuHeight(shape, touch) };
  const rect = placeSubmenu({ menu, rowY, object: owner.object }, size, owner.stage);
  return (
    <Panel label={SUB_TITLE[sub]} rect={rect}>
      {choices.map((choice, at) => (
        <Row
          key={choice.key}
          label={choice.label}
          icon={choice.on ? 'check' : null}
          trailing={null}
          look="plain"
          disabled={false}
          highlighted={focus.subIndex === at}
          checked={choice.on}
          expanded={undefined}
          touch={touch}
          onPress={(): void => {
            pickChoice(owner, sub, choice.key);
          }}
        />
      ))}
    </Panel>
  );
}

function rowLook(action: ObjectAction, locked: boolean): RowLook {
  if (action.destructive) return 'danger';
  return action.id === 'lock' && locked ? 'amber' : 'plain';
}

function ModeRow({ gizmo }: { readonly gizmo: MenuGizmo }): ReactNode {
  return (
    <View>
      <View className="flex-row p-1">
        <ModeSwitch
          mode={gizmo.mode}
          modes={gizmo.modes}
          space={gizmo.space}
          look="row"
          onMode={gizmo.onMode}
        />
      </View>
      <View className="my-1 h-hairline bg-outline-variant" />
    </View>
  );
}

export function ObjectContextMenu(props: ObjectContextMenuProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const [focus, setFocus] = useMenuKeys(props);
  const dividers = props.actions.some((action) => action.destructive) ? 1 : 0;
  const header = modeRowHeight(props.gizmo !== null);
  const height = menuHeight({ rows: props.actions.length, dividers, header }, touch);
  const size = { width: MENU_WIDTH_PX, height };
  const rect = placeMenu(props.object, size, props.stage);
  return (
    <View pointerEvents="box-none" className="absolute inset-0">
      <Panel label={props.title} rect={rect}>
        {props.gizmo === null ? null : <ModeRow gizmo={props.gizmo} />}
        {props.actions.map((action, at) => (
          <View key={action.id}>
            {action.destructive && at > 0 ? (
              <View className="my-1 h-hairline bg-outline-variant" />
            ) : null}
            <Row
              label={action.label}
              icon={action.icon}
              trailing={<Trailing action={action} touch={touch} />}
              look={rowLook(action, props.locked)}
              disabled={action.disabled}
              highlighted={focus.sub === null && focus.index === at}
              checked={undefined}
              expanded={action.submenu ? focus.sub === action.id : undefined}
              touch={touch}
              onPress={(): void => {
                const sub = subOf(action);
                if (sub === null) runAction(props, action);
                else setFocus({ index: at, sub: focus.sub === sub ? null : sub, subIndex: 0 });
              }}
            />
          </View>
        ))}
      </Panel>
      {focus.sub === null ? null : (
        <Submenu owner={props} focus={focus} menu={rect} sub={focus.sub} touch={touch} />
      )}
    </View>
  );
}
