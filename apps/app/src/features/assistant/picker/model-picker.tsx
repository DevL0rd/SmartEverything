import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AiModelKind, EngineKind } from '@smarteverything/domain';
import { ErrorState } from '../../../components/error-state';
import { IconButton } from '../../../components/icon-button';
import { SearchField } from '../../../components/search-field';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Text } from '../../../components/text';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { useFavouriteModels } from '../data/favourites';
import { effortLabel } from './efforts';
import { keptEffort, type ModelChoice, type ModelPick } from './model-choice';
import { ModelList } from './model-list';
import {
  useProviderView,
  useProvidersView,
  useSearchView,
  useSuggestedView,
  useWorkerView,
  type PickerView,
  type ViewData,
} from './model-views';
import { useModelChoice, type WorkerEngine } from './engine-models';

const NONE = '';
const SEARCH_DELAY_MS = 200;

export interface ModelPickerProps {
  readonly engine: EngineKind;
  readonly kind?: AiModelKind;
  readonly picked: ModelPick | null;
  readonly onPick: ((pick: ModelPick) => void) | null;
}

function workerOf(engine: EngineKind): WorkerEngine | null {
  return engine === 'openrouter' ? null : engine;
}

interface ViewInput {
  readonly engine: EngineKind;
  readonly kind: AiModelKind;
  readonly current: string | null;
  readonly query: string;
  readonly view: PickerView;
  readonly setView: (view: PickerView) => void;
}

type Mode = 'worker' | 'search' | PickerView['kind'];

function modeOf(engine: EngineKind, query: string, view: PickerView): Mode {
  if (engine !== 'openrouter') {
    return 'worker';
  }
  return query === '' ? view.kind : 'search';
}

function useView({ engine, kind, current, query, view, setView }: ViewInput): ViewData {
  const mode = modeOf(engine, query, view);
  const views: Readonly<Record<Mode, ViewData>> = {
    suggested: useSuggestedView(kind, current, mode === 'suggested', () => {
      setView({ kind: 'providers' });
    }),
    search: useSearchView(kind, query, mode === 'search'),
    providers: useProvidersView(kind, mode === 'providers', (provider, name) => {
      setView({ kind: 'provider', provider, name });
    }),
    provider: useProviderView(
      kind,
      mode === 'provider' && view.kind === 'provider' ? view.provider : null,
    ),
    worker: useWorkerView(workerOf(engine), query),
  };
  return views[mode];
}

const SEGMENTED_MAX = 4;

function ThinkingControl({
  efforts,
  value,
  onChange,
}: {
  readonly efforts: readonly string[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const options = [
    { value: NONE, label: 'Default' },
    ...efforts.map((effort) => ({ value: effort, label: effortLabel(effort) })),
  ];
  if (efforts.length > SEGMENTED_MAX) {
    return <Select label="Thinking" options={options} value={value} onChange={onChange} />;
  }
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        Thinking
      </Text>
      <Segmented label="Thinking" value={value} options={options} onChange={onChange} />
    </View>
  );
}

function Thinking({
  model,
  picked,
  onPick,
}: {
  readonly model: ModelChoice | null;
  readonly picked: ModelPick | null;
  readonly onPick: ((pick: ModelPick) => void) | null;
}): ReactNode {
  if (model === null || picked === null || onPick === null || model.efforts.length === 0) {
    return null;
  }
  return (
    <View className="pb-2">
      <ThinkingControl
        efforts={model.efforts}
        value={picked.effort ?? NONE}
        onChange={(value) => {
          onPick({ model: model.id, effort: value === NONE ? null : value });
        }}
      />
    </View>
  );
}

function Title({
  view,
  onBack,
}: {
  readonly view: PickerView;
  readonly onBack: () => void;
}): ReactNode {
  if (view.kind === 'suggested') {
    return null;
  }
  return (
    <View className="flex-row items-center gap-1">
      <IconButton icon="arrowLeft" label="Back" onPress={onBack} />
      <Text variant="title-3" numberOfLines={1} className="min-w-0 flex-1">
        {view.kind === 'providers' ? 'All providers' : view.name}
      </Text>
    </View>
  );
}

interface BodyProps {
  readonly data: ViewData;
  readonly selected: string | null;
  readonly onPick: ((model: ModelChoice) => void) | null;
}

function Body({ data, selected, onPick }: BodyProps): ReactNode {
  const favourites = useFavouriteModels();
  const ready = favourites.status === 'ready';
  if (data.error !== null && data.items.length === 0) {
    return <ErrorState error={data.error} retry={data.retry} />;
  }
  if (!data.loading && data.items.length === 0) {
    return (
      <Text variant="callout" tone="variant" className="px-3 py-4">
        {data.empty}
      </Text>
    );
  }
  return (
    <ModelList
      items={data.items}
      selected={selected}
      favourites={ready ? favourites.favourites : new Set()}
      onFavourite={ready ? favourites.toggle : null}
      onEnd={data.more}
      loading={data.loading}
      onPick={onPick}
    />
  );
}

function pickHandler(
  { onPick, picked }: ModelPickerProps,
  remember: (model: ModelChoice) => void,
): ((model: ModelChoice) => void) | null {
  if (onPick === null) {
    return null;
  }
  return (model) => {
    remember(model);
    onPick({ model: model.id, effort: keptEffort(model, picked?.effort ?? null) });
  };
}

export function ModelPicker(props: ModelPickerProps): ReactNode {
  const [text, setText] = useState('');
  const [view, setView] = useState<PickerView>({ kind: 'suggested' });
  const [tapped, setTapped] = useState<ModelChoice | null>(null);
  const { engine, kind = 'chat', picked, onPick } = props;
  const pickedId = picked === null ? null : picked.model;
  const initial = useModelChoice(engine, pickedId);
  const chosen = tapped ?? initial;
  const query = useDebouncedValue(text.trim(), SEARCH_DELAY_MS);
  const data = useView({ engine, kind, current: pickedId, query, view, setView });
  return (
    <View className="min-h-0 flex-1 gap-2">
      <Thinking model={chosen} picked={picked} onPick={onPick} />
      <SearchField value={text} onChange={setText} placeholder="Search models" variant="field" />
      <Title
        view={text === '' ? view : { kind: 'suggested' }}
        onBack={() => {
          setView(view.kind === 'provider' ? { kind: 'providers' } : { kind: 'suggested' });
        }}
      />
      <Body data={data} selected={chosen?.id ?? pickedId} onPick={pickHandler(props, setTapped)} />
    </View>
  );
}
