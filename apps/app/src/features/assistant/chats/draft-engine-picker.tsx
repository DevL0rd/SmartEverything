import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, Platform, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { ComputerAiRuntime, Engine } from '@smarteverything/domain';
import { AdaptivePanel, usePanelFrame } from '../../../components/adaptive-panel';
import { Button } from '../../../components/button';
import { BrandGlyph } from '../../../components/brand-glyphs';
import { COMPACT_PANEL_INSET } from '../../../components/compact-panel';
import { useFocusRequest } from '../../../components/focus-request';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { ReasonLine } from '../../../components/reason-line';
import { SheetBody } from '../../../components/sheet-body';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useIsOwner } from '../../../store/selectors';
import { FolderPicker } from '../../computers';
import { usePickerSession } from '../picker/model-search-session';
import { PanelHead } from '../picker/panel/panel-chrome';
import { usePanelSubpage } from '../picker/panel/panel-subpage';
import { ENGINE_CATALOGUE_KEY, useEngineCatalogue } from '../provider/provider-data';
import type { EngineCatalogue } from '../provider/engine-catalogue';
import { NATIVE_OWNER_REASON } from '../provider/provider-access';
import {
  NATIVE_CATALOGUE_CHECKING,
  nativeComputer,
  nativeDraftEngine,
  nativeNeedsFolder,
} from '../data/draft-native';
import { focusModelTrigger } from './model-menu-anchor';
import {
  ChoiceRows,
  type ComputerOption,
  type OptionsState,
  type Page,
  type Target,
} from './draft-engine-choices';
import { NATIVE_CHAT_BRANDS, NATIVE_CHAT_NAMES } from './native-chat-brand';

interface Props {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly onCoordinator: () => void;
}

export function openDraftEnginePicker(): void {
  router.setParams({ operation: 'engine' });
}

export function DraftEnginePicker(
  props: Props & { readonly deviceAnchorRef: RefObject<View | null> },
): ReactNode {
  const anchorRef = useRef<View>(null);
  const { operation } = useLocalSearchParams<{ operation?: string }>();
  const runtime =
    operation === 'engine-computer' && props.engine.kind !== 'dsh' ? props.engine.kind : null;
  const open = operation === 'engine' || runtime !== null;
  useEffect(() => {
    if (open && Platform.OS !== 'web') Keyboard.dismiss();
  }, [open]);
  const activeAnchor = runtime === null ? anchorRef : props.deviceAnchorRef;
  const label = props.engine.kind === 'dsh' ? 'Coordinator' : NATIVE_CHAT_NAMES[props.engine.kind];
  const close = (): void => {
    router.setParams({ operation: undefined });
    focusModelTrigger(activeAnchor);
  };
  return (
    <View ref={anchorRef} className="min-w-0 flex-1">
      <Interactive
        label={`Chat engine, ${label}`}
        expanded={operation === 'engine'}
        onPress={openDraftEnginePicker}
        className="min-h-14 flex-row items-center gap-1.5 rounded-lg border-hairline border-outline bg-surface-2 px-2.5"
        layerClassName="rounded-lg"
      >
        {props.engine.kind === 'dsh' ? (
          <Icon name="sparkles" size={16} tone="primary" />
        ) : (
          <BrandGlyph brand={NATIVE_CHAT_BRANDS[props.engine.kind]} size={16} />
        )}
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {label}
        </Text>
        <Icon name="chevronDown" size={16} tone="variant" />
      </Interactive>
      {open ? (
        <DraftEngineChoices
          key={operation}
          {...props}
          anchorRef={activeAnchor}
          close={close}
          runtime={runtime}
        />
      ) : null}
    </View>
  );
}

interface OpenProps extends Props {
  readonly runtime: ComputerAiRuntime | null;
  readonly anchorRef?: RefObject<View | null>;
  readonly close: () => void;
  readonly onBack?: () => void;
}

function useNativeChoice(props: OpenProps): (target: Target, cwd?: string) => string | null {
  const query = useQueryClient();
  const session = usePickerSession();
  const owner = useIsOwner();
  return (target, cwd): string | null => {
    if (!owner) return NATIVE_OWNER_REASON;
    if (!session.valid())
      return 'Your connection or profile changed. Open the engine picker again.';
    const catalogue = query.getQueryData<EngineCatalogue>(ENGINE_CATALOGUE_KEY);
    const selection = nativeSelection(catalogue, target, props.engine, cwd);
    if (typeof selection === 'string') return selection;
    props.onChange(selection);
    props.close();
    return null;
  };
}

function nativeSelection(
  catalogue: EngineCatalogue | undefined,
  target: Target,
  previous: Engine,
  cwd: string | undefined,
): Engine | string {
  const computer = nativeComputer(catalogue?.computers, target.runtime, target.deviceId);
  if (catalogue === undefined || computer === undefined)
    return 'This computer is unavailable. Choose again.';
  const engine = nativeDraftEngine(catalogue, computer, previous);
  return cwd === undefined ? engine : withFolder(engine, cwd);
}

function withFolder(engine: ReturnType<typeof nativeDraftEngine>, cwd: string): Engine {
  if (engine.kind === 'claude') return { ...engine, settings: { ...engine.settings, cwd } };
  return { ...engine, settings: { ...engine.settings, cwd } };
}

function computerOptions(catalogue: EngineCatalogue, engine: Engine): readonly ComputerOption[] {
  return catalogue.computers.map((computer) => ({
    target: { runtime: computer.runtime, deviceId: computer.device_id },
    name: computer.name,
    configured: computer.enabled,
    detail: !computer.enabled ? 'Provider turned off' : !computer.online ? 'Offline' : undefined,
    needsFolder: computer.online && nativeNeedsFolder(computer, engine),
  }));
}

function useOptions(engine: Engine): OptionsState {
  const owner = useIsOwner();
  const session = usePickerSession();
  const catalogue = useEngineCatalogue();
  if (!owner) return { options: [], reason: NATIVE_OWNER_REASON };
  if (!session.ready || catalogue.data === undefined)
    return { options: [], reason: catalogue.error?.message ?? NATIVE_CATALOGUE_CHECKING };
  return { options: computerOptions(catalogue.data, engine), reason: null };
}

interface ChoiceView {
  readonly page: Page;
  readonly folder: Target | null;
  readonly back: () => void;
  readonly rows: ReactNode;
}

function useChoices(props: OpenProps, touch: boolean): ChoiceView {
  const [page, setPage] = useState<Page>(
    props.runtime === null ? { kind: 'engines' } : { kind: 'computers', runtime: props.runtime },
  );
  const [folder, setFolder] = useState<Target | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const choose = useNativeChoice(props);
  const state = useOptions(props.engine);
  const backFromFolder = (): void => {
    if (folder !== null) setPage(folderOrigin(page, folder));
    setFolder(null);
  };
  const select = (option: ComputerOption): void => {
    setProblem(null);
    if (option.needsFolder) setFolder(option.target);
    else setProblem(choose(option.target));
  };
  const backFromComputers = (): void => {
    if (page.kind === 'computers') setPage({ kind: 'engines', focusRuntime: page.runtime });
  };
  const parent =
    page.kind === 'computers' && props.runtime === null ? backFromComputers : props.onBack;
  return {
    page,
    folder,
    back: folder !== null ? backFromFolder : (parent ?? props.close),
    rows:
      folder === null ? (
        <EngineRows
          {...{ page, state, setPage, select, problem, touch }}
          engine={props.engine}
          coordinator={(): void => {
            props.onCoordinator();
            props.close();
          }}
          close={props.close}
          onBack={parent ?? null}
        />
      ) : (
        <WorkingFolder
          target={folder}
          back={backFromFolder}
          close={props.close}
          select={(target, path): void => {
            backFromFolder();
            setProblem(choose(target, path));
          }}
        />
      ),
  };
}

export function DraftEngineChoices(props: OpenProps): ReactNode {
  const sheet = useIdiom() === 'touch';
  const { page, folder, back, rows } = useChoices(props, sheet);
  const title =
    folder !== null ? 'Choose folder' : page.kind === 'engines' ? 'Chat engine' : 'Choose computer';
  const embedded = props.anchorRef === undefined;
  const innerPage = folder !== null || page.kind === 'computers';
  usePanelSubpage(embedded ? title : null, innerPage ? back : null);
  if (props.anchorRef === undefined) {
    const padding = sheet ? '' : cn(COMPACT_PANEL_INSET, 'py-1');
    return (
      <SheetBody scroll={folder === null} fit padding={folder === null ? padding : ''}>
        {rows}
      </SheetBody>
    );
  }
  return (
    <AdaptivePanel
      anchorRef={props.anchorRef}
      open
      fit
      compact
      chrome
      scroll={folder === null}
      onClose={props.close}
      onBack={back}
      label={title}
    >
      {rows}
    </AdaptivePanel>
  );
}

function folderOrigin(page: Page, target: Target): Page {
  return page.kind === 'engines'
    ? { kind: 'engines', focusRuntime: target.runtime }
    : { ...page, focusDeviceId: target.deviceId };
}

function EngineRows({
  page,
  problem,
  touch,
  close,
  onBack,
  ...rows
}: Parameters<typeof ChoiceRows>[0] & {
  readonly problem: string | null;
  readonly touch: boolean;
  readonly close: () => void;
  readonly onBack: (() => void) | null;
}): ReactNode {
  return (
    <View className={touch ? '' : 'gap-1'}>
      <PanelHead
        title={page.kind === 'engines' ? 'Chat engine' : 'Choose computer'}
        onBack={page.kind === 'computers' ? null : onBack}
        onClose={close}
      />
      {problem === null ? null : <ReasonLine text={problem} />}
      <ChoiceRows {...rows} page={page} />
    </View>
  );
}

function WorkingFolder({
  target,
  back,
  close,
  select,
}: {
  readonly target: Target;
  readonly back: () => void;
  readonly close: () => void;
  readonly select: (target: Target, path?: string) => void;
}): ReactNode {
  const focusBack = useFocusRequest(true);
  const sheet = usePanelFrame().presentation === 'sheet';
  return (
    <View className={cn('min-h-0 shrink', !sheet && cn(COMPACT_PANEL_INSET, 'pb-2'))}>
      <PanelHead
        title="Choose folder"
        onBack={back}
        onClose={close}
        backLabel="Back"
        backRef={focusBack}
      />
      <FolderPicker
        compact
        mode="folder"
        deviceId={target.deviceId}
        onCancel={back}
        onChoose={(path): void => {
          select(target, path);
        }}
      />
      <Button
        label="Continue without a folder"
        variant="text"
        onPress={(): void => {
          select(target);
        }}
      />
    </View>
  );
}
