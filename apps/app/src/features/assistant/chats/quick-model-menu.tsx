import type { ReactElement, ReactNode } from 'react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { type TextInput, View, useWindowDimensions } from 'react-native';
import {
  AUTO_LATEST_GEMINI_FLASH,
  type Engine,
  type AiModelSearchSort,
} from '@smarteverything/domain';
import type { Rect } from '../../../components/anchor';
import { Popover } from '../../../components/popover';
import { SearchField } from '../../../components/search-field';
import { IconButton } from '../../../components/icon-button';
import { ChatDeviceControl, useEngineAccessory } from './engine-accessories';
import { Text } from '../../../components/text';
import { Button } from '../../../components/button';
import { useIsOwner } from '../../../store/selectors';
import type { ModelPickerProps } from '../picker/model-picker';
import type { ModelPick } from '../picker/model-choice';
import { isComputerEngine } from '../provider/computer-engine';
import { modelOrNull } from '../picker/model-label';
import { useSearchPickerData } from '../picker/model-search-data';
import { ModelSearchResults } from '../picker/model-search-results';
import { EMPTY_MODEL_FILTERS, type ModelSearchFilters } from '../picker/model-search-filters';
import { usePickerSession } from '../picker/model-search-session';
import { NATIVE_OWNER_REASON } from '../provider/provider-access';
import { useModelPickAuthority } from './model-pick-authority';
import { QuickMenuList, QuickThinking } from './quick-model-controls';
const EXPANDED_WIDTH = 500;
const EXPANDED_HEIGHT = 720;
const VIEWPORT_MARGIN_AND_GAP = 12;
const CHROME_HEIGHT_FRACTION = 0.55;
interface Props {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked: boolean;
  readonly close: () => void;
}
interface MenuState {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly filters: ModelSearchFilters;
  readonly setFilters: (filters: ModelSearchFilters) => void;
  readonly sort: AiModelSearchSort;
  readonly setSort: (sort: AiModelSearchSort) => void;
  readonly filtersOpen: boolean;
  readonly openFilters: (open: boolean) => void;
  readonly details: boolean;
  readonly showDetails: (open: boolean) => void;
  readonly expanded: boolean;
  readonly expand: (expanded: boolean) => void;
}
function pickEngine(pick: ModelPick): Engine {
  return pick.engine ?? { kind: 'openrouter', model: modelOrNull(pick.model), effort: pick.effort };
}
function useQuickPicker(props: Props): ModelPickerProps {
  const valid = useModelPickAuthority(props);
  const owner = useIsOwner();
  const session = usePickerSession();
  const accessory = useEngineAccessory();
  const editable = !props.blocked && (!isComputerEngine(props.engine) || owner) && session.ready;
  return {
    picked: {
      model: props.engine.model ?? AUTO_LATEST_GEMINI_FLASH,
      effort: props.engine.effort,
      engine: props.engine,
    },
    onPick: editable
      ? (pick): void => {
          if (valid()) {
            props.onChange(pickEngine(pick));
            props.close();
          }
        }
      : null,
    onNativeNeeded:
      accessory === null || !editable
        ? undefined
        : (request): void => {
            if (valid()) {
              accessory.request(request);
              props.close();
            }
          },
  };
}
interface ChromeProps extends Props {
  readonly state: MenuState;
  readonly editable: boolean;
}
function QuickSearch({ state }: { readonly state: MenuState }): ReactNode {
  const input = useRef<TextInput>(null);
  return (
    <View className="flex-row items-center gap-1">
      <View className="min-w-0 flex-1">
        <SearchField
          inputRef={input}
          value={state.text}
          onChange={(text): void => {
            state.setText(text);
            state.expand(true);
          }}
          placeholder="Search models"
          variant="field"
          onSubmit={(): void => undefined}
        />
      </View>
      {state.expanded ? (
        <IconButton
          icon="chevronDown"
          label="Return to compact menu"
          onPress={(): void => {
            state.expand(false);
            input.current?.focus();
          }}
        />
      ) : null}
    </View>
  );
}
function QuickChrome({ state, editable, ...props }: ChromeProps): ReactNode {
  const accessory = useEngineAccessory();
  const valid = useModelPickAuthority(props);
  return (
    <View className="gap-3 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="variant">
          Machine
        </Text>
        <ChatDeviceControl
          engine={props.engine}
          {...(accessory?.chat === undefined ? {} : { chat: accessory.chat })}
          blocked={props.blocked}
        />
      </View>
      <QuickThinking
        engine={props.engine}
        onChange={(engine): void => {
          if (valid()) props.onChange(engine);
        }}
        blocked={!editable}
      />
      <QuickSearch state={state} />
      {editable ? null : (
        <Text variant="caption" tone="variant">
          {props.blocked ? 'Stop active work before changing its model.' : NATIVE_OWNER_REASON}
        </Text>
      )}
    </View>
  );
}
interface BodyProps extends Props {
  readonly state: MenuState;
  readonly height: number;
}
function QuickResults({
  state,
  data,
}: {
  readonly state: MenuState;
  readonly data: ReturnType<typeof useSearchPickerData>;
}): ReactNode {
  return (
    <ModelSearchResults
      data={data}
      controls={{
        filters: state.filters,
        setFilters: state.setFilters,
        sort: state.sort,
        setSort: state.setSort,
        expanded: state.filtersOpen,
        toggle: (): void => {
          state.openFilters(!state.filtersOpen);
        },
        makers: data.makers.data ?? [],
        native: data.sources.candidates,
      }}
      details={state.details}
      toggleDetails={(): void => {
        state.showDetails(!state.details);
      }}
      clearSearch={(): void => {
        state.setText('');
      }}
    />
  );
}
function QuickList({
  state,
  data,
  close,
  chrome,
  height,
}: {
  readonly state: MenuState;
  readonly data: ReturnType<typeof useSearchPickerData>;
  readonly close: () => void;
  readonly chrome: ReactElement;
  readonly height: number;
}): ReactNode {
  const favorites = [
    ...new Map(
      data.sources.candidates.filter((row) => row.favourite).map((row) => [row.key, row]),
    ).values(),
  ];
  return (
    <QuickMenuList
      rows={state.expanded ? [] : favorites}
      close={close}
      height={state.expanded ? height * CHROME_HEIGHT_FRACTION : height}
      showFavorites={!state.expanded}
      header={<QuickHeader chrome={chrome} expanded={state.expanded} />}
      footer={state.expanded ? null : <QuickFooter state={state} />}
    />
  );
}
function QuickHeader({
  chrome,
  expanded,
}: {
  readonly chrome: ReactElement;
  readonly expanded: boolean;
}): ReactNode {
  return (
    <View>
      {chrome}
      {expanded ? null : (
        <View className="pb-3 pt-3">
          <Text variant="caption" tone="variant" className="px-6">
            Favorites
          </Text>
        </View>
      )}
    </View>
  );
}
function QuickFooter({ state }: { readonly state: MenuState }): ReactNode {
  return (
    <View className="py-3">
      <Button
        label="All models"
        variant="text"
        onPress={(): void => {
          state.expand(true);
        }}
      />
    </View>
  );
}
function QuickBody({ state, height, ...props }: BodyProps): ReactNode {
  const owner = useIsOwner();
  const session = usePickerSession();
  const picker = useQuickPicker(props);
  const data = useSearchPickerData(picker, state);
  const editable = !props.blocked && (!isComputerEngine(props.engine) || owner) && session.ready;
  const bodyFrame = { maxHeight: height };
  return (
    <View className={state.expanded ? 'min-h-0 flex-1' : 'min-h-0 shrink'} style={bodyFrame}>
      <QuickList
        state={state}
        data={data}
        close={props.close}
        height={height}
        chrome={<QuickChrome {...props} state={state} editable={editable} />}
      />
      {state.expanded ? <QuickResults state={state} data={data} /> : null}
    </View>
  );
}
function useMenuState(): MenuState {
  const [filtersOpen, openFilters] = useState(false);
  const [details, showDetails] = useState(false);
  const [text, setText] = useState('');
  const [filters, setFilters] = useState(EMPTY_MODEL_FILTERS);
  const [sort, setSort] = useState<AiModelSearchSort>('newest');
  const [expanded, expand] = useState(false);
  return {
    text,
    setText,
    filters,
    setFilters,
    sort,
    setSort,
    expanded,
    expand,
    filtersOpen,
    openFilters,
    details,
    showDetails,
  };
}
export function QuickModelMenu({
  anchor,
  ...props
}: Props & { readonly anchor: Rect | null }): ReactNode {
  const state = useMenuState();
  const session = usePickerSession();
  const window = useWindowDimensions();
  const height = Math.min(
    EXPANDED_HEIGHT,
    Math.max(0, Math.min(anchor?.y ?? 0, window.height) - VIEWPORT_MARGIN_AND_GAP),
  );
  useMenuLifetime(state, props.close, anchor);
  return (
    <Popover
      open={anchor !== null && session.ready}
      anchor={anchor}
      onClose={(): void => {
        if (state.details) state.showDetails(false);
        else if (state.filtersOpen) state.openFilters(false);
        else props.close();
      }}
      label="Model and thinking"
      width={state.expanded ? EXPANDED_WIDTH : 320}
      {...(state.expanded ? { height } : {})}
      placement="above"
      scroll={false}
    >
      {anchor === null ? null : <QuickBody {...props} state={state} height={height} />}
    </Popover>
  );
}

function useMenuLifetime(state: MenuState, close: () => void, anchor: Rect | null): void {
  const session = usePickerSession();
  const accessory = useEngineAccessory();
  const reset = useEffectEvent((): void => {
    state.expand(false);
    state.openFilters(false);
    state.showDetails(false);
    state.setText('');
    state.setFilters(EMPTY_MODEL_FILTERS);
    state.setSort('newest');
    close();
  });
  const compact = useEffectEvent((): void => {
    state.expand(false);
    state.openFilters(false);
    state.showDetails(false);
  });
  useEffect(() => {
    reset();
  }, [session.key, accessory?.chat?.id]);
  useEffect(() => {
    if (!session.ready) reset();
  }, [session.ready]);
  useEffect(() => {
    if (anchor === null) compact();
  }, [anchor]);
}
