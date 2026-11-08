import { useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import type { HomeMapObject, ModelSpec } from '@smarteverything/domain';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import type { Tone } from '../../../../components/tone';
import { cn } from '../../../../design/cn';
import { subOf, type SubChoice, type SubmenuId } from '../manipulate/menu-model';
import { AxesToggle, ModeSwitch, SnapToggle } from '../manipulate/mode-switch';
import type { ObjectAction } from '../manipulate/object-actions';
import type { SelectionActions } from '../manipulate/selection-actions';
import type { Manipulation } from '../manipulate/use-manipulation';
import {
  commitField,
  fieldText,
  transformFields,
  type ObjectEditFacts,
  type TransformField,
} from './object-edit-model';

export const LOCKED_CHIP = 'Locked';
export const UNLOCK_LABEL = 'Unlock to edit';
export const FIELDS_LABEL = 'Position and size';
export const ACTIONS_LABEL = 'Actions';

const ROW_SIZE = 3;

export interface FieldsProps {
  readonly object: HomeMapObject;
  readonly spec: ModelSpec;
  readonly facts: ObjectEditFacts;
  readonly off: boolean;
  readonly mode: Manipulation['gizmo']['mode'];
  readonly onPatch: (patch: Partial<HomeMapObject>) => void;
}

interface FieldProps extends Omit<FieldsProps, 'spec' | 'mode'> {
  readonly field: TransformField;
  readonly lit: boolean;
}

function fieldFrame(editable: boolean, lit: boolean, error: boolean): string {
  if (error) return 'border-critical';
  if (!editable) return 'border-dashed border-outline';
  return lit ? 'border-primary' : 'border-outline-variant';
}

const invalidProps = (invalid: boolean): { readonly 'aria-invalid': boolean } => ({
  'aria-invalid': invalid,
});

interface FieldDraft {
  readonly text: string;
  readonly error: string | null;
  readonly type: (text: string) => void;
  readonly commit: () => void;
}

function useFieldDraft({ field, object, facts, onPatch }: FieldProps): FieldDraft {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return {
    text: draft ?? fieldText(field.unit, field.value),
    error,
    type: (text): void => {
      setDraft(text);
      setError(null);
    },
    commit: (): void => {
      if (draft === null) return;
      const result = commitField(object, facts, field, draft);
      setDraft(null);
      setError(result.kind === 'invalid' ? result.reason : null);
      if (result.kind === 'patch') onPatch(result.patch);
    },
  };
}

function NumberField(props: FieldProps): ReactNode {
  const { field, lit, off } = props;
  const draft = useFieldDraft(props);
  const editable = !off && field.editable;
  const signed = field.min === null || field.min < 0;
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {field.label}
      </Text>
      <View
        className={cn(
          'h-11 flex-row items-center rounded-md border bg-surface-2 pr-3',
          'web:focus-within:outline-2 web:focus-within:outline-offset-2 web:focus-within:outline-focus',
          fieldFrame(editable, lit, draft.error !== null),
        )}
      >
        <TextInput
          accessibilityLabel={field.label}
          {...invalidProps(draft.error !== null)}
          value={draft.text}
          editable={editable}
          keyboardType={signed ? 'numbers-and-punctuation' : 'decimal-pad'}
          selectTextOnFocus
          onChangeText={draft.type}
          onSubmitEditing={draft.commit}
          onBlur={draft.commit}
          cursorColorClassName="accent-primary"
          selectionColorClassName="accent-primary"
          className={cn(
            'h-full min-w-0 flex-1 px-3 font-sans text-body text-on-surface tabular web:outline-none',
            !editable && 'opacity-60',
          )}
        />
        <Text variant="footnote" tone="variant">
          {field.unit}
        </Text>
      </View>
      {draft.error === null ? null : (
        <Text variant="caption" tone="critical" accessibilityLiveRegion="polite">
          {draft.error}
        </Text>
      )}
    </View>
  );
}

function rowsOf(fields: readonly TransformField[]): readonly (readonly TransformField[])[] {
  const count = Math.ceil(fields.length / ROW_SIZE);
  return Array.from({ length: count }, (_, at) => fields.slice(at * ROW_SIZE, (at + 1) * ROW_SIZE));
}

export function TransformFields({ spec, mode, ...field }: FieldsProps): ReactNode {
  const rows = rowsOf(transformFields(field.object, spec));
  return (
    <View accessibilityLabel={FIELDS_LABEL} className="gap-3">
      {rows.map((row) => (
        <View key={row.map((each) => each.id).join()} className="flex-row gap-2">
          {row.map((each) => (
            <NumberField
              key={each.id}
              field={each}
              lit={!field.off && each.group === mode}
              {...field}
            />
          ))}
          {Array.from({ length: ROW_SIZE - row.length }, (_, at) => (
            <View key={at} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

export interface InspectorHeadProps {
  readonly manipulation: Manipulation;
  readonly readOnly: boolean;
  readonly onUnlock: () => void;
}

export function InspectorHead({ manipulation, readOnly, onUnlock }: InspectorHeadProps): ReactNode {
  const { gizmo, modes, locked } = manipulation;
  const still = modes.length === 0;
  return (
    <View className="gap-3">
      {locked ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge label={LOCKED_CHIP} icon="lock" />
          <Button label={UNLOCK_LABEL} icon="lockOpen" disabled={readOnly} onPress={onUnlock} />
        </View>
      ) : null}
      <View className="flex-row items-center gap-1">
        <ModeSwitch
          mode={gizmo.mode}
          modes={modes}
          space={gizmo.space}
          look="row"
          onMode={manipulation.setMode}
        />
        <SnapToggle on={gizmo.snapping} disabled={still} onToggle={manipulation.toggleSnapping} />
        <AxesToggle space={gizmo.space} disabled={still} onToggle={manipulation.toggleSpace} />
      </View>
    </View>
  );
}

function toneOf(action: ObjectAction, locked: boolean): Tone {
  if (action.destructive) return 'critical';
  return action.id === 'lock' && locked ? 'onPrimaryContainer' : 'default';
}

interface ActionRowProps {
  readonly action: ObjectAction;
  readonly locked: boolean;
  readonly keys: boolean;
  readonly open: boolean | undefined;
  readonly onPress: () => void;
}

function Trailing({ action, keys }: Pick<ActionRowProps, 'action' | 'keys'>): ReactNode {
  if (action.submenu) return <Icon name="chevronRight" size={16} tone="faint" />;
  if (!keys || action.shortcut === null) return null;
  return (
    <Text variant="caption" tone="faint">
      {action.shortcut}
    </Text>
  );
}

function ActionRow({ action, locked, keys, open, onPress }: ActionRowProps): ReactNode {
  const tone = toneOf(action, locked);
  return (
    <Interactive
      role="menuitem"
      label={action.label}
      disabled={action.disabled}
      expanded={open}
      onPress={onPress}
      className={cn(
        'min-h-11 flex-row items-center gap-3 rounded-sm px-3',
        tone === 'onPrimaryContainer' ? 'bg-primary-container' : open === true && 'bg-surface-3',
      )}
      layerClassName="rounded-sm"
    >
      <Icon name={action.icon} size={20} tone={tone === 'default' ? 'variant' : tone} />
      <Text variant="body" tone={tone} numberOfLines={1} className="min-w-0 flex-1">
        {action.label}
      </Text>
      <Trailing action={action} keys={keys} />
    </Interactive>
  );
}

function RoomChoices({
  rooms,
  onPick,
}: {
  readonly rooms: readonly SubChoice[];
  readonly onPick: (key: string) => void;
}): ReactNode {
  return (
    <View accessibilityRole="menu" accessibilityLabel="Rooms" className="gap-0.5 pl-8">
      {rooms.map((room) => (
        <Interactive
          key={room.key}
          role="menuitem"
          label={room.label}
          checked={room.on}
          onPress={(): void => {
            onPick(room.key);
          }}
          className="min-h-11 flex-row items-center gap-2 rounded-sm px-3"
          layerClassName="rounded-sm"
        >
          <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
            {room.label}
          </Text>
          {room.on ? <Icon name="check" size={16} tone="primary" /> : null}
        </Interactive>
      ))}
    </View>
  );
}

export interface ActionListProps {
  readonly actions: SelectionActions;
  readonly locked: boolean;
  readonly keys: boolean;
  readonly looks: ReactNode;
}

function opened(sub: SubmenuId, props: ActionListProps, onClose: () => void): ReactNode {
  if (sub === 'style') return props.looks;
  return (
    <RoomChoices
      rooms={props.actions.rooms}
      onPick={(key): void => {
        onClose();
        props.actions.onRoom(key);
      }}
    />
  );
}

export function ActionList(props: ActionListProps): ReactNode {
  const [open, setOpen] = useState<SubmenuId | null>(null);
  return (
    <View accessibilityRole="menu" accessibilityLabel={ACTIONS_LABEL} className="gap-0.5">
      {props.actions.actionsFor('menu').map((action) => {
        const sub = subOf(action);
        return (
          <View key={action.id} className="gap-1">
            <ActionRow
              action={action}
              locked={props.locked}
              keys={props.keys}
              open={sub === null ? undefined : open === sub}
              onPress={(): void => {
                if (sub !== null) setOpen(open === sub ? null : sub);
                else if (action.id !== 'style' && action.id !== 'move')
                  props.actions.onAction(action.id);
              }}
            />
            {sub !== null && open === sub
              ? opened(sub, props, (): void => {
                  setOpen(null);
                })
              : null}
          </View>
        );
      })}
    </View>
  );
}
