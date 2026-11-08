import { useCommandTransient } from '../commands/transient';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Engine } from '@smarteverything/domain';
import { useIsOwner } from '../../../store/selectors';
import type { NativeModelRequest } from '../provider/subscription-models';
import { useChatModel } from './chat-model';
import { Skeleton } from '../../../components/skeleton';
import { useHarnessCatalogue } from '../data/harness';
import { routeFacts, useRouteInfo } from '../data/route-info';
import { useEngineCatalogue } from '../provider/provider-data';
import { ModelPanel } from '../picker/panel/model-panel';
import { useChipShortcuts } from '../picker/panel/panel-shortcuts';
import { modelPanelPage, type PanelPage } from '../picker/panel/panel-state';
import type { ComposerClass } from '../model/ai-layout';
import { CompactPickerControl } from '../components/compact-picker-control';
import { ComposerClassProvider } from '../components/composer-accessory-layout';
import { useEngineAccessory, useMachineSwitchPending } from './engine-accessories';
import { focusModelTrigger } from './model-menu-anchor';
import {
  appliedEffort,
  chipLabel,
  effortText,
  levelSteps,
  useEngineThinking,
} from './engine-efforts';
import { returnsFocus, type MenuDismissal } from './menu-dismissal';

function useEngineEditable(engine: Engine, blocked: boolean): boolean {
  const owner = useIsOwner();
  const draft = useEngineAccessory()?.host.draft === true;
  return !blocked && (draft || !isComputerEngine(engine) || owner);
}

export interface ModelChipProps {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked?: boolean;
  readonly composerClass?: ComposerClass;
  readonly anchorRef?: RefObject<View | null>;
  readonly machineInHeader?: boolean;
}

interface PanelOpening {
  readonly page: PanelPage | null;
  readonly show: (page: PanelPage) => void;
  readonly hide: () => void;
}

function usePanelOpening(engine: Engine, machineInHeader: boolean): PanelOpening {
  const accessory = useEngineAccessory();
  const { operation, work } = useLocalSearchParams<{ operation?: string; work?: string }>();
  const [chosen, setChosen] = useState<PanelPage | null>(null);
  const pending = accessory === null ? null : accessory.pending;
  const [dismissed, setDismissed] = useState<NativeModelRequest | null>(null);
  const routed = modelPanelPage(
    machineInHeader && operation === 'device' ? undefined : operation,
    work,
    engine.kind,
  );
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
  machineInHeader,
}: {
  readonly engine: Engine;
  readonly chipRef: RefObject<View | null>;
  readonly onOpen: () => void;
  readonly machineInHeader: boolean;
}): ReactNode {
  const model = useChatModel(engine);
  const accessory = useEngineAccessory();
  const switching = useMachineSwitchPending(accessory?.chat);
  const needsMachine = accessory !== null && accessory.pending !== null;
  const thinking = useEngineThinking(engine);
  const facts = routeFacts(useRouteInfo(engine).data);
  if (useModelLoading(model)) return <ChipSkeleton />;
  const icon = switching && !machineInHeader ? 'loader' : needsMachine ? 'monitor' : 'brain';
  return (
    <CompactPickerControl
      anchorRef={chipRef}
      label={chipLabel(model.name, effortText(thinking, engine.effort), facts)}
      value={needsMachine ? 'Choose machine' : model.shortName}
      suffix={needsMachine ? null : effortText(thinking, engine.effort)}
      steps={levelSteps(appliedEffort(thinking, engine.effort))}
      icon={icon}
      unrestricted={needsMachine}
      onPress={onOpen}
    />
  );
}

interface ChipPanel {
  readonly page: PanelPage | null;
  readonly openMain: () => void;
  readonly close: () => void;
}

function useChipPanel(
  engine: Engine,
  chipRef: RefObject<View | null>,
  machineInHeader: boolean,
): ChipPanel {
  const opening = usePanelOpening(engine, machineInHeader);
  const closeFor = (reason: MenuDismissal): void => {
    opening.hide();
    if (returnsFocus(reason, opening.page !== null)) focusModelTrigger(chipRef);
  };
  const dismissCommands = useCommandTransient((): void => {
    closeFor('composer-panel');
  });
  return {
    page: opening.page,
    openMain: (): void => {
      dismissCommands();
      opening.show('main');
    },
    close: (): void => {
      closeFor('user');
    },
  };
}

export function ModelChip({
  engine,
  onChange,
  blocked = false,
  composerClass,
  anchorRef,
  machineInHeader = false,
}: ModelChipProps): ReactNode {
  const chipRef = useRef<View>(null);
  const panel = useChipPanel(engine, chipRef, machineInHeader);
  const editable = useEngineEditable(engine, blocked);
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
      <ChipControl
        engine={engine}
        chipRef={chipRef}
        onOpen={panel.openMain}
        machineInHeader={machineInHeader}
      />
      {panel.page === null ? null : (
        <ModelPanel
          anchorRef={anchorRef ?? chipRef}
          engine={engine}
          onChange={onChange}
          blocked={blocked}
          initialPage={panel.page}
          close={panel.close}
          machineInHeader={machineInHeader}
        />
      )}
    </ClassScope>
  );
}
