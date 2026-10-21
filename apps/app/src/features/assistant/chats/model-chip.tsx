import { useCommandTransient } from '../commands/transient';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Engine } from '@smarteverything/domain';
import { useIsOwner } from '../../../store/selectors';
import { NATIVE_OWNER_REASON } from '../provider/provider-access';
import type { NativeModelRequest } from '../provider/subscription-models';
import { useChatModel } from './chat-model';
import { ImageLibrary } from '../picker/image/image-library';
import { ModelLibrary, useLibraryDisclosure } from '../picker/model-library';
import { Skeleton } from '../../../components/skeleton';
import { useHarnessCatalogue } from '../data/harness';
import { useEngineCatalogue } from '../provider/provider-data';
import { ModelPanel } from '../picker/panel/model-panel';
import { recentIdOfEngine, useRecentModels } from '../picker/panel/panel-recent';
import { useChipShortcuts } from '../picker/panel/panel-shortcuts';
import type { PanelPage } from '../picker/panel/panel-state';
import { effortSteps } from '../model/composer-state';
import type { ComposerClass } from '../model/ai-layout';
import { CompactPickerControl } from '../components/compact-picker-control';
import { ComposerClassProvider } from '../components/composer-accessory-layout';
import { useEngineAccessory, useMachineSwitchPending } from './engine-accessories';
import { focusModelTrigger } from './model-menu-anchor';
import { returnsFocus, type MenuDismissal } from './menu-dismissal';

const BLOCKED_NOTE = 'Stop active work before changing its model.';

function useEngineEditable(engine: Engine, blocked: boolean): boolean {
  const owner = useIsOwner();
  return !blocked && (!isComputerEngine(engine) || owner);
}

export function EngineSheet({
  open,
  onClose,
  engine,
  onChange,
  blocked = false,
  initialQuery,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked?: boolean;
  readonly initialQuery?: string;
}): ReactNode {
  const accessory = useEngineAccessory();
  const editable = useEngineEditable(engine, blocked);
  return (
    <ModelLibrary
      open={open}
      onClose={onClose}
      mode="pick"
      engine={engine}
      onChange={editable ? onChange : null}
      note={editable ? null : blocked ? BLOCKED_NOTE : NATIVE_OWNER_REASON}
      {...(initialQuery === undefined ? {} : { initialQuery })}
      onNativeNeeded={accessory === null || !editable ? undefined : accessory.request}
    />
  );
}

export interface ModelChipProps {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked?: boolean;
  readonly composerClass?: ComposerClass;
  readonly anchorRef?: RefObject<View | null>;
}

interface PanelOpening {
  readonly page: PanelPage | null;
  readonly show: (page: PanelPage) => void;
  readonly hide: () => void;
}

function routedPage(operation: string | undefined, engine: Engine): PanelPage | null {
  if (operation === 'model') return 'main';
  return operation === 'device' && engine.kind === 'dsh' ? 'machine' : null;
}

function usePanelOpening(engine: Engine): PanelOpening {
  const accessory = useEngineAccessory();
  const { operation } = useLocalSearchParams<{ operation?: string }>();
  const [chosen, setChosen] = useState<PanelPage | null>(null);
  const pending = accessory === null ? null : accessory.pending;
  const [dismissed, setDismissed] = useState<NativeModelRequest | null>(null);
  const routed = routedPage(operation, engine);
  const asked = pending !== null && pending !== dismissed;
  return {
    page: chosen ?? routed ?? (asked ? 'machine' : null),
    show: setChosen,
    hide: (): void => {
      setChosen(null);
      setDismissed(pending);
      if (routed !== null) router.setParams({ work: undefined, operation: undefined });
    },
  };
}

function useModelLoading(model: ReturnType<typeof useChatModel>): boolean {
  const harness = useHarnessCatalogue();
  const native = useEngineCatalogue();
  return model.provider === null && (harness.isLoading || native.isLoading);
}

function ChipSkeleton(): ReactNode {
  return (
    <View aria-busy accessibilityLabel="Loading model" className="min-h-touch-min justify-center">
      <Skeleton className="h-8 w-24 rounded-md" />
    </View>
  );
}

function ClassScope({
  value,
  children,
}: {
  readonly value: ComposerClass | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return value === undefined ? (
    children
  ) : (
    <ComposerClassProvider value={value}>{children}</ComposerClassProvider>
  );
}

function ChipControl({
  engine,
  chipRef,
  onOpen,
}: {
  readonly engine: Engine;
  readonly chipRef: RefObject<View | null>;
  readonly onOpen: () => void;
}): ReactNode {
  const model = useChatModel(engine);
  const accessory = useEngineAccessory();
  const switching = useMachineSwitchPending(accessory?.chat);
  const needsMachine = accessory !== null && accessory.pending !== null;
  if (useModelLoading(model)) return <ChipSkeleton />;
  const icon = switching ? 'loader' : needsMachine ? 'monitor' : 'brain';
  return (
    <CompactPickerControl
      anchorRef={chipRef}
      label={`Model and thinking: ${model.name}, ${model.effort ?? 'Default'}. Opens the model menu`}
      value={needsMachine ? 'Choose machine' : model.shortName}
      suffix={needsMachine ? null : model.effort}
      steps={effortSteps(model.effort)}
      icon={icon}
      unrestricted={needsMachine}
      onPress={onOpen}
    />
  );
}

interface ChipPanel {
  readonly page: PanelPage | null;
  readonly library: string | null;
  readonly imageLibrary: boolean;
  readonly openMain: () => void;
  readonly close: () => void;
  readonly openLibrary: (query: string) => void;
  readonly closeLibrary: () => void;
  readonly openImageLibrary: () => void;
  readonly closeImageLibrary: () => void;
}

function useChipPanel(engine: Engine, chipRef: RefObject<View | null>): ChipPanel {
  const opening = usePanelOpening(engine);
  const disclosure = useLibraryDisclosure();
  const [imageLibrary, setImageLibrary] = useState(false);
  const closeFor = (reason: MenuDismissal): void => {
    opening.hide();
    if (returnsFocus(reason, opening.page !== null)) focusModelTrigger(chipRef);
  };
  const dismissCommands = useCommandTransient((): void => {
    closeFor('composer-panel');
  });
  return {
    page: opening.page,
    library: disclosure.query,
    imageLibrary,
    openMain: (): void => {
      dismissCommands();
      opening.show('main');
    },
    close: (): void => {
      closeFor('user');
    },
    openLibrary: (query): void => {
      opening.hide();
      disclosure.open(query);
    },
    closeLibrary: (): void => {
      disclosure.close();
      focusModelTrigger(chipRef);
    },
    openImageLibrary: (): void => {
      opening.hide();
      setImageLibrary(true);
    },
    closeImageLibrary: (): void => {
      setImageLibrary(false);
      focusModelTrigger(chipRef);
    },
  };
}

function useRecordedChange(onChange: (engine: Engine) => void): (engine: Engine) => void {
  const recent = useRecentModels();
  return (next): void => {
    const id = recentIdOfEngine(next);
    if (id !== null) recent.record(id);
    onChange(next);
  };
}

export function ModelChip({
  engine,
  onChange,
  blocked = false,
  composerClass,
  anchorRef,
}: ModelChipProps): ReactNode {
  const chipRef = useRef<View>(null);
  const panel = useChipPanel(engine, chipRef);
  const editable = useEngineEditable(engine, blocked);
  const recorded = useRecordedChange(onChange);
  useChipShortcuts({
    engine,
    editable,
    onChange,
    toggle: (): void => {
      if (panel.page === null) panel.openMain();
      else panel.close();
    },
  });
  return (
    <ClassScope value={composerClass}>
      <ChipControl engine={engine} chipRef={chipRef} onOpen={panel.openMain} />
      {panel.page === null ? null : (
        <ModelPanel
          anchorRef={anchorRef ?? chipRef}
          engine={engine}
          onChange={onChange}
          blocked={blocked}
          initialPage={panel.page}
          close={panel.close}
          onLibrary={panel.openLibrary}
          onImageLibrary={panel.openImageLibrary}
        />
      )}
      {panel.imageLibrary ? <ImageLibrary open onClose={panel.closeImageLibrary} /> : null}
      {panel.library === null ? null : (
        <EngineSheet
          open
          onClose={panel.closeLibrary}
          engine={engine}
          onChange={recorded}
          blocked={blocked}
          {...(panel.library === '' ? {} : { initialQuery: panel.library })}
        />
      )}
    </ClassScope>
  );
}
