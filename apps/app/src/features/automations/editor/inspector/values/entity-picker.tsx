import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import {
  API_ENDPOINTS as E,
  type JsonValue,
  type PluginOption,
  type PluginOptionQuery,
} from '@smarteverything/domain';
import { api } from '../../../../../api/transport';
import {
  useChosenOptions,
  useOptionPages,
  type OptionFeed,
} from '../../../../plugins/data/option-queries';
import { OptionVisual } from '../../../../plugins/picker/option-visual';
import {
  NO_PLUGIN_REASON,
  chosenNote,
  chosenViewOf,
  entityChoices,
  entityKey,
  entityRefOf,
  heldEntity,
  type ChosenView,
  type EntityRef,
} from './entity-picker-model';
import { OptionPicker } from './option-picker';
import type { PickerOption } from './option-picker-model';

export interface EntityPickerProps {
  readonly of: string;
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: JsonValue) => void;
  readonly showLabel?: boolean;
}

function entityFeed(ref: EntityRef): OptionFeed {
  return {
    key: entityKey(ref, []),
    read: (query: PluginOptionQuery) =>
      api().call(E.readAutomationEntityOptions, {
        params: { pluginId: ref.pluginId, entity: ref.entity },
        query,
      }),
  };
}

function knownOptions(
  listed: readonly PluginOption[],
  view: ChosenView,
): ReadonlyMap<string, PluginOption> {
  const chosen = view.state === 'found' ? [view.option] : [];
  return new Map([...listed, ...chosen].map((option) => [option.id, option]));
}

function leadOf(known: ReadonlyMap<string, PluginOption>, option: PickerOption): ReactNode {
  const found = known.get(option.id);
  return found === undefined ? null : <OptionVisual option={found} size="s" />;
}

type FieldProps = Omit<EntityPickerProps, 'of'> & { readonly entity: EntityRef };

function EntityField({
  entity,
  label,
  value,
  disabled,
  onChange,
  showLabel,
}: FieldProps): ReactNode {
  const feed = entityFeed(entity);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PluginOption | null>(null);
  const search = useDeferredValue(query).trim();
  const pages = useOptionPages(feed, search, open);
  const held = heldEntity(value);
  const chosen = useChosenOptions(feed, held === null ? [] : [held]);
  const view = chosenViewOf(held, chosen.data, picked);
  const known = knownOptions(pages.options, view);
  return (
    <OptionPicker
      label={label}
      showLabel={showLabel ?? true}
      options={entityChoices(pages.options, view)}
      disabled={disabled}
      note={chosenNote(view)}
      leadOf={(option) => leadOf(known, option)}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
      remote={{
        search: setQuery,
        more: pages.more,
        loading: pages.loading,
        blocked: pages.unavailable,
        error: pages.error,
        retry: pages.retry,
      }}
      multiple={false}
      value={held}
      onPick={(id) => {
        const option = known.get(id);
        if (option !== undefined) setPicked(option);
        onChange(id);
      }}
    />
  );
}

export function EntityPicker({ of, ...props }: EntityPickerProps): ReactNode {
  const entity = entityRefOf(of);
  if (entity !== null) return <EntityField {...props} entity={entity} />;
  const held = heldEntity(props.value);
  return (
    <OptionPicker
      label={props.label}
      showLabel={props.showLabel ?? true}
      options={held === null ? [] : [{ id: held, label: held }]}
      disabled
      reason={NO_PLUGIN_REASON}
      multiple={false}
      value={held}
      onPick={() => undefined}
    />
  );
}
