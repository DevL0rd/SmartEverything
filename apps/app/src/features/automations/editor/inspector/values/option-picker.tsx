import type { ReactNode, RefObject } from 'react';
import { useDeferredValue, useRef, useState } from 'react';
import { View } from 'react-native';
import { measureAnchor, type Rect } from '../../../../../components/anchor';
import { Button } from '../../../../../components/button';
import { ErrorState } from '../../../../../components/error-state';
import { Icon, isIconName } from '../../../../../components/icon';
import { Interactive } from '../../../../../components/interactive';
import { KeyboardList, useKeyboardRow } from '../../../../../components/keyboard-list';
import { SearchField } from '../../../../../components/search-field';
import { Skeleton } from '../../../../../components/skeleton';
import { Text } from '../../../../../components/text';
import { cn } from '../../../../../design/cn';
import { useIdiom } from '../../../../../design/platform';
import { selectionTick } from '../../../../../platform/haptics';
import {
  canPress,
  matchOptions,
  spokenOf,
  summaryOf,
  toggled,
  type PickerOption,
} from './option-picker-model';
import { OptionPickerSurface } from './option-picker-surface';

export interface RemoteFeed {
  readonly search: (query: string) => void;
  readonly more: (() => void) | null;
  readonly loading: boolean;
  readonly blocked: string | null;
  readonly error: unknown;
  readonly retry: () => void;
}

interface OptionPickerBase {
  readonly label: string;
  readonly options: readonly PickerOption[];
  readonly disabled: boolean;
  readonly reason?: string | null;
  readonly note?: string | null;
  readonly placeholder?: string;
  readonly showLabel?: boolean;
  readonly remote?: RemoteFeed;
  readonly leadOf?: (option: PickerOption) => ReactNode;
  readonly onOpenChange?: (open: boolean) => void;
}

export type OptionPickerProps = OptionPickerBase &
  (
    | {
        readonly multiple: false;
        readonly value: string | null;
        readonly onPick: (id: string) => void;
      }
    | {
        readonly multiple: true;
        readonly held: readonly string[];
        readonly onChange: (ids: readonly string[]) => void;
      }
  );

interface ListModel {
  readonly label: string;
  readonly options: readonly PickerOption[];
  readonly held: readonly string[];
  readonly multiple: boolean;
  readonly touch: boolean;
  readonly press: (id: string) => void;
  readonly remote: RemoteFeed | null;
  readonly leadOf: ((option: PickerOption) => ReactNode) | null;
}

function RowMark({
  option,
  selected,
  model,
}: {
  readonly option: PickerOption;
  readonly selected: boolean;
  readonly model: ListModel;
}): ReactNode {
  if (model.multiple) {
    return (
      <View
        className={cn(
          'size-5 items-center justify-center rounded-sm border',
          selected ? 'border-primary bg-primary' : 'border-outline',
        )}
      >
        {selected ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      </View>
    );
  }
  if (model.leadOf !== null) return model.leadOf(option);
  if (option.icon !== undefined && isIconName(option.icon)) {
    return <Icon name={option.icon} size={20} tone="variant" />;
  }
  return null;
}

function RowText({ option }: { readonly option: PickerOption }): ReactNode {
  const note = [option.unavailable, option.detail].filter((part) => part !== undefined);
  return (
    <View className="min-w-0 flex-1">
      <Text
        variant="body"
        tone={option.unavailable === undefined ? 'default' : 'faint'}
        numberOfLines={1}
      >
        {option.label}
      </Text>
      {note.length === 0 ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {note.join(' · ')}
        </Text>
      )}
    </View>
  );
}

function OptionRow({
  option,
  model,
}: {
  readonly option: PickerOption;
  readonly model: ListModel;
}): ReactNode {
  const keyboard = useKeyboardRow(option.id);
  const selected = model.held.includes(option.id);
  return (
    <View
      nativeID={keyboard.nativeID}
      className={cn('rounded-sm', keyboard.highlighted && 'bg-surface-2')}
    >
      <Interactive
        role={model.multiple ? 'checkbox' : 'radio'}
        label={spokenOf(option)}
        disabled={!canPress(option, model.held)}
        {...(model.multiple ? { checked: selected } : { selected })}
        onPress={() => {
          keyboard.highlight();
          model.press(option.id);
        }}
        className={cn(
          'min-h-11 flex-row items-center gap-3',
          model.touch ? 'px-4' : 'mx-1 rounded-sm px-3',
        )}
        layerClassName="rounded-sm"
      >
        <RowMark option={option} selected={selected} model={model} />
        <RowText option={option} />
        {selected && !model.multiple ? <Icon name="check" size={20} tone="primary" /> : null}
      </Interactive>
    </View>
  );
}

function RemoteFoot({
  remote,
  shown,
  searched,
}: {
  readonly remote: RemoteFeed;
  readonly shown: number;
  readonly searched: boolean;
}): ReactNode {
  if (remote.blocked !== null) {
    return (
      <View className="gap-2 px-4 py-3">
        <Text variant="callout" tone="variant">
          {remote.blocked}
        </Text>
        <Button label="Try again" variant="text" onPress={remote.retry} />
      </View>
    );
  }
  if (remote.error !== null) return <ErrorState error={remote.error} retry={remote.retry} />;
  if (shown === 0 && remote.loading) return <Skeleton shape="block" className="mx-4 h-32" />;
  if (shown === 0) return <EmptyText searched={searched} />;
  return remote.more === null ? null : (
    <Button label="Show more" variant="text" loading={remote.loading} onPress={remote.more} />
  );
}

function EmptyText({ searched }: { readonly searched: boolean }): ReactNode {
  return (
    <Text variant="callout" tone="variant" className="px-4 py-3">
      {searched ? 'Nothing matches that search.' : 'Nothing to pick yet.'}
    </Text>
  );
}

function ListFoot({
  model,
  shown,
  searched,
}: {
  readonly model: ListModel;
  readonly shown: number;
  readonly searched: boolean;
}): ReactNode {
  if (model.remote !== null) {
    return <RemoteFoot remote={model.remote} shown={shown} searched={searched} />;
  }
  if (shown > 0) return null;
  return <EmptyText searched={model.options.length > 0} />;
}

function OptionList({
  model,
  onEscape,
}: {
  readonly model: ListModel;
  readonly onEscape: () => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const { remote } = model;
  const shown = remote === null ? matchOptions(model.options, deferred) : model.options;
  return (
    <KeyboardList
      items={shown.map((option) => ({ id: option.id, disabled: !canPress(option, model.held) }))}
      label={model.label}
      autoHighlight
      onActivate={model.press}
      onEscape={onEscape}
      className={model.touch ? '-mx-4' : ''}
    >
      <View className={model.touch ? 'px-4 pb-2' : 'p-2'}>
        <SearchField
          value={query}
          onChange={(next) => {
            setQuery(next);
            remote?.search(next);
          }}
          placeholder={`Search ${model.label.toLowerCase()}`}
          focusOnMount={!model.touch}
        />
      </View>
      <View
        accessibilityRole={model.multiple ? 'list' : 'radiogroup'}
        accessibilityLabel={model.label}
      >
        {shown.map((option) => (
          <OptionRow key={option.id} option={option} model={model} />
        ))}
      </View>
      <ListFoot model={model} shown={shown.length} searched={query.trim() !== ''} />
    </KeyboardList>
  );
}

function Trigger({
  label,
  shown,
  chosen,
  lead,
  disabled,
  open,
  opener,
  onOpen,
}: {
  readonly label: string;
  readonly shown: string;
  readonly chosen: boolean;
  readonly lead: ReactNode;
  readonly disabled: boolean;
  readonly open: boolean;
  readonly opener: RefObject<View | null>;
  readonly onOpen: () => void;
}): ReactNode {
  return (
    <Interactive
      ref={opener}
      label={`${label}: ${shown}`}
      hint="Opens a searchable list"
      disabled={disabled}
      expanded={open}
      onPress={onOpen}
      className="min-h-11 flex-row items-center gap-2 rounded-md border border-outline bg-surface-2 pl-3 pr-2"
      layerClassName="rounded-md"
    >
      {lead}
      <Text
        variant="body"
        tone={chosen ? 'default' : 'variant'}
        className="flex-1"
        numberOfLines={1}
      >
        {shown}
      </Text>
      <Icon name="chooser" size={16} />
    </Interactive>
  );
}

function Footnote({ text }: { readonly text: string | null }): ReactNode {
  if (text === null || text === '') return null;
  return (
    <Text variant="footnote" tone="variant">
      {text}
    </Text>
  );
}

function heldIn(props: OptionPickerProps): readonly string[] {
  if (props.multiple) return props.held;
  return props.value === null || props.value === '' ? [] : [props.value];
}

function pressOf(props: OptionPickerProps, close: () => void): (id: string) => void {
  return (id) => {
    selectionTick();
    if (props.multiple) {
      props.onChange(toggled(props.held, id));
      return;
    }
    close();
    props.onPick(id);
  };
}

function modelOf(props: OptionPickerProps, touch: boolean, close: () => void): ListModel {
  return {
    label: props.label,
    options: props.options,
    held: heldIn(props),
    multiple: props.multiple,
    touch,
    press: pressOf(props, close),
    remote: props.remote ?? null,
    leadOf: props.leadOf ?? null,
  };
}

function chosenLead(model: ListModel): ReactNode {
  const [first] = model.held;
  if (model.multiple || model.leadOf === null || first === undefined) return null;
  const chosen = model.options.find((option) => option.id === first);
  return chosen === undefined ? null : model.leadOf(chosen);
}

export function OptionPicker(props: OptionPickerProps): ReactNode {
  const { label, disabled, reason = null, note = null, placeholder = 'Pick one' } = props;
  const touch = useIdiom() === 'touch';
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const show = (next: Rect | null): void => {
    setAnchor(next);
    props.onOpenChange?.(next !== null);
  };
  const close = (): void => {
    show(null);
  };
  const model = modelOf(props, touch, close);
  return (
    <View className="gap-1">
      <Footnote text={props.showLabel === false ? null : label} />
      <Trigger
        label={label}
        shown={summaryOf(model.options, model.held, placeholder)}
        chosen={model.held.length > 0}
        lead={chosenLead(model)}
        disabled={disabled || reason !== null}
        open={anchor !== null}
        opener={ref}
        onOpen={() => {
          measureAnchor(ref, show);
        }}
      />
      <Footnote text={reason} />
      <Footnote text={note} />
      <OptionPickerSurface
        label={label}
        touch={touch}
        multiple={model.multiple}
        anchor={anchor}
        opener={ref}
        onClose={close}
      >
        <OptionList model={model} onEscape={close} />
      </OptionPickerSurface>
    </View>
  );
}
