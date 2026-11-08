import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ComputerAiRuntime, Engine } from '@smarteverything/domain';
import { BrandGlyph } from '../../../components/brand-glyphs';
import { Button } from '../../../components/button';
import {
  COMPACT_DETAIL_ROW_HEIGHT,
  COMPACT_ROW_FRAME,
  COMPACT_ROW_ICON_SIZE,
} from '../../../components/compact-panel';
import { useFocusRequest } from '../../../components/focus-request';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { NATIVE_CHAT_BRANDS, NATIVE_CHAT_NAMES } from './native-chat-brand';

export interface Target {
  readonly runtime: ComputerAiRuntime;
  readonly deviceId: string;
}
export type Page =
  | { readonly kind: 'engines'; readonly focusRuntime?: ComputerAiRuntime }
  | {
      readonly kind: 'computers';
      readonly runtime: ComputerAiRuntime;
      readonly focusDeviceId?: string;
    };

export interface ComputerOption {
  readonly target: Target;
  readonly name: string;
  readonly needsFolder: boolean;
  readonly configured?: boolean;
  readonly detail?: string | undefined;
}

export interface OptionsState {
  readonly options: readonly ComputerOption[];
  readonly reason: string | null;
}

const RUNTIMES: readonly ComputerAiRuntime[] = ['claude', 'codex'];

interface RowsProps {
  readonly page: Page;
  readonly state: OptionsState;
  readonly engine: Engine;
  readonly setPage: (page: Page) => void;
  readonly select: (option: ComputerOption) => void;
  readonly coordinator: () => void;
}

export function ChoiceRows(props: RowsProps): ReactNode {
  if (props.page.kind === 'computers')
    return <ComputerRows {...props} runtime={props.page.runtime} />;
  return (
    <>
      <ChoiceRow
        title="Coordinator"
        detail="Home Hub or your computer"
        selected={props.engine.kind === 'dsh'}
        runtime={null}
        onPress={props.coordinator}
      />
      {RUNTIMES.map((runtime) => (
        <RuntimeRow key={runtime} {...props} runtime={runtime} />
      ))}
    </>
  );
}

function RuntimeRow({
  page,
  runtime,
  state,
  engine,
  setPage,
  select,
}: RowsProps & { readonly runtime: ComputerAiRuntime }): ReactNode {
  const options = state.options.filter((option) => option.target.runtime === runtime);
  const configured = options.filter((option) => option.configured !== false);
  const preferred = configured.length === 1 ? configured[0] : undefined;
  const [expanded, setExpanded] = useState(false);
  const detail = state.reason ?? runtimeDetail(options.length);
  const blocked = state.reason !== null || options.length === 0;
  const showReason = blocked && expanded;
  const pick = (): void => {
    if (blocked) setExpanded(!expanded);
    else if (preferred !== undefined) select(preferred);
    else if (options.length === 1 && options[0] !== undefined) select(options[0]);
    else setPage({ kind: 'computers', runtime });
  };
  return (
    <View>
      <ChoiceRow
        title={NATIVE_CHAT_NAMES[runtime]}
        detail={showReason ? 'Can’t start a new chat' : detail}
        runtime={runtime}
        selected={engine.kind === runtime}
        focus={page.kind === 'engines' && page.focusRuntime === runtime}
        expanded={blocked ? expanded : undefined}
        onPress={pick}
      />
      {showReason ? (
        <Text
          variant="footnote"
          tone="variant"
          accessibilityLiveRegion="polite"
          className="px-3 pb-2"
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function runtimeDetail(count: number): string {
  if (count === 0) return 'No connected computers supply this engine.';
  return count === 1 ? '1 computer' : `${String(count)} computers`;
}

function ComputerRows({
  page,
  runtime,
  state,
  engine,
  setPage,
  select,
}: RowsProps & { readonly runtime: ComputerAiRuntime }): ReactNode {
  const options = state.options.filter((option) => option.target.runtime === runtime);
  const requested = page.kind === 'computers' ? page.focusDeviceId : undefined;
  const focused = options.find((option) => option.target.deviceId === requested);
  const back = useFocusRequest(focused === undefined);
  return (
    <>
      <Button
        ref={back}
        label="Back to engines"
        variant="text"
        icon="chevronLeft"
        onPress={(): void => {
          setPage({ kind: 'engines', focusRuntime: runtime });
        }}
      />
      {state.reason === null ? null : (
        <Text tone="variant" accessibilityLiveRegion="polite">
          {state.reason}
        </Text>
      )}
      {options.map((option) => (
        <ChoiceRow
          key={option.target.deviceId}
          title={option.name}
          runtime={null}
          detail={
            option.detail ?? (option.needsFolder ? 'Choose a working folder' : 'Use this computer')
          }
          selected={engine.kind === runtime && engine.device_id === option.target.deviceId}
          focus={option === focused}
          onPress={(): void => {
            select(option);
          }}
        />
      ))}
    </>
  );
}

interface ChoiceRowProps {
  readonly title: string;
  readonly detail: string;
  readonly runtime: ComputerAiRuntime | null;
  readonly selected: boolean;
  readonly expanded?: boolean | undefined;
  readonly onPress: () => void;
  readonly focus?: boolean;
}

function ChoiceRow({
  title,
  detail,
  runtime,
  selected,
  expanded,
  onPress,
  focus = false,
}: ChoiceRowProps): ReactNode {
  const ref = useFocusRequest(focus);
  const touch = useIdiom() === 'touch';
  return (
    <Interactive
      ref={ref}
      label={`${title}, ${detail}`}
      selected={selected}
      focusInset={touch}
      expanded={expanded}
      onPress={onPress}
      className={cn(
        COMPACT_ROW_FRAME,
        'rounded-md opacity-100',
        touch ? cn(COMPACT_DETAIL_ROW_HEIGHT, 'px-2 py-1') : 'min-h-touch-min px-3 py-2',
      )}
      layerClassName="rounded-md"
    >
      <View aria-hidden className={touch ? '' : 'size-6 items-center justify-center'}>
        {runtime === null ? (
          <Icon name="monitor" size={COMPACT_ROW_ICON_SIZE} tone="variant" />
        ) : (
          <BrandGlyph brand={NATIVE_CHAT_BRANDS[runtime]} size={COMPACT_ROW_ICON_SIZE} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="body-strong">{title}</Text>
        <Text variant="footnote" tone="variant">
          {detail}
        </Text>
      </View>
      {selected ? <Icon name="check" size={COMPACT_ROW_ICON_SIZE} tone="primary" /> : null}
      {expanded === undefined ? null : (
        <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
      )}
    </Interactive>
  );
}
