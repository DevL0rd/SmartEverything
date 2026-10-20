import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Screen } from '../../../components/screen';
import { TabsBar } from '../../../components/tabs-bar';
import { Text } from '../../../components/text';
import { atLeast, useSizeClass, type WidthClass } from '../../../design/size-class';
import type { Device } from '../../../store/state';
import { DeviceBanner } from '../detail/device-overview';
import { DeviceHeader } from '../detail/device-header';
import { AdviceSheet } from './advice-sheet';
import { CareCard } from './care';
import { HistoryCard } from './history';
import { MaintenanceCard } from './maintenance';
import { NotifyCard } from './notices-section';
import { OptionsCard } from './options';
import { ProgramPicker } from './program-picker';
import { SettingsCard } from './settings';
import { LaundryStage } from './stage';
import { StartButton } from './start-button';
import { WhenCard } from './when';
import { useCycles } from './use-cycles';
import { useLaundryDraft, type DraftHandle } from './use-draft';
import { useLaundry, type Laundry } from './use-laundry';
import { useRunner, type Runner } from './use-runner';
import type { CycleView } from './cycles';
import { reportedOf } from './draft';
import { temperatureWord } from './stage-text';

type Tab = 'program' | 'history' | 'maintenance' | 'settings';

const TABS: readonly { readonly key: Tab; readonly label: string }[] = [
  { key: 'program', label: 'Program' },
  { key: 'history', label: 'History' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'settings', label: 'Settings' },
];

interface Parts {
  readonly laundry: Laundry;
  readonly draft: DraftHandle;
  readonly cycles: CycleView;
  readonly runner: Runner;
}

function ProgramCard({ laundry, draft }: Pick<Parts, 'laundry' | 'draft'>): ReactNode {
  return (
    <Card title="Program">
      <ProgramPicker laundry={laundry} draft={draft} />
    </Card>
  );
}

function SummaryCard({ laundry }: { readonly laundry: Laundry }): ReactNode {
  const { state, snapshot } = laundry;
  const shown = reportedOf(snapshot.values);
  const parts = [
    shown.temperature === null ? null : temperatureWord(shown.temperature),
    shown.spin === null || shown.spin === 0 ? null : `${String(shown.spin)} rpm`,
    shown.rinses === null ? null : `${String(shown.rinses)} rinses`,
  ].filter((part): part is string => part !== null);
  const note =
    state.key === 'delayed'
      ? `Starts ${state.startsAt ?? 'later'}. Start now or cancel the delay to change options.`
      : 'Options are locked while the machine runs.';
  return (
    <Card title="Program">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="body-strong">{state.program ?? 'Program'}</Text>
          <Text variant="footnote" tone="variant" className="tabular">
            {parts.join(' · ')}
          </Text>
        </View>
        <Icon name="lock" size={20} />
      </View>
      <Text variant="footnote" tone="variant">
        {note}
      </Text>
    </Card>
  );
}

function Setup({ laundry, draft }: Pick<Parts, 'laundry' | 'draft'>): ReactNode {
  return (
    <>
      <ProgramCard laundry={laundry} draft={draft} />
      <OptionsCard laundry={laundry} draft={draft} />
    </>
  );
}

function Banners({
  laundry,
  onAdvice,
}: {
  readonly laundry: Laundry;
  readonly onAdvice: () => void;
}): ReactNode {
  const { fault } = laundry.state;
  return (
    <View className="gap-2">
      <DeviceBanner device={laundry.device} />
      {fault === null ? null : (
        <Banner
          tone="critical"
          title={`${fault.title} (E${String(fault.code)})`}
          body={fault.advice}
          wrapBody
          action={{ label: 'What to do', onPress: onAdvice }}
        />
      )}
    </View>
  );
}

function Compact({ parts }: { readonly parts: Parts }): ReactNode {
  const { laundry, draft, cycles, runner } = parts;
  const resting = laundry.state.resting;
  return (
    <View className="gap-section-gap">
      <LaundryStage
        laundry={laundry}
        cycles={cycles}
        estimate={draft.estimate}
        runner={runner}
        starting={draft.starting}
      />
      {resting ? <Setup laundry={laundry} draft={draft} /> : <SummaryCard laundry={laundry} />}
      {resting ? <WhenCard draft={draft} disabled={laundry.state.offline} /> : null}
      <NotifyCard laundry={laundry} />
      <CareCard laundry={laundry} />
      <MaintenanceCard laundry={laundry} cycles={cycles} />
      <HistoryCard deviceId={laundry.device.id} cycles={cycles.cycles} />
      <SettingsCard laundry={laundry} collapsible />
    </View>
  );
}

function Columns({
  left,
  right,
}: {
  readonly left: readonly ReactNode[];
  readonly right: readonly ReactNode[];
}): ReactNode {
  return (
    <View className="flex-row items-start gap-section-gap">
      <View className="min-w-0 flex-1 gap-section-gap">{left}</View>
      <View className="min-w-0 flex-1 gap-section-gap">{right}</View>
    </View>
  );
}

function mediumColumns(parts: Parts): {
  readonly left: readonly ReactNode[];
  readonly right: readonly ReactNode[];
} {
  const { laundry, draft, cycles } = parts;
  const maintenance = <MaintenanceCard key="maintenance" laundry={laundry} cycles={cycles} />;
  const history = <HistoryCard key="history" deviceId={laundry.device.id} cycles={cycles.cycles} />;
  const notify = <NotifyCard key="notify" laundry={laundry} />;
  const care = <CareCard key="care" laundry={laundry} />;
  const settings = <SettingsCard key="settings" laundry={laundry} collapsible={false} />;
  if (!laundry.state.resting) {
    return {
      left: [<SummaryCard key="summary" laundry={laundry} />, notify, maintenance, history],
      right: [care, settings],
    };
  }
  return {
    left: [
      <Setup key="setup" laundry={laundry} draft={draft} />,
      <WhenCard key="when" draft={draft} disabled={laundry.state.offline} />,
      <StartButton key="start" laundry={laundry} draft={draft} />,
      maintenance,
      history,
    ],
    right: [care, notify, settings],
  };
}

function Medium({ parts }: { readonly parts: Parts }): ReactNode {
  const { laundry, draft, cycles, runner } = parts;
  return (
    <View className="gap-section-gap">
      <LaundryStage
        laundry={laundry}
        cycles={cycles}
        estimate={draft.estimate}
        runner={runner}
        starting={draft.starting}
      />
      <Columns {...mediumColumns(parts)} />
    </View>
  );
}

function TabBody({ tab, parts }: { readonly tab: Tab; readonly parts: Parts }): ReactNode {
  const { laundry, draft, cycles } = parts;
  const resting = laundry.state.resting;
  switch (tab) {
    case 'history':
      return <HistoryCard deviceId={laundry.device.id} cycles={cycles.cycles} />;
    case 'maintenance':
      return <MaintenanceCard laundry={laundry} cycles={cycles} />;
    case 'settings':
      return (
        <>
          <NotifyCard laundry={laundry} />
          <SettingsCard laundry={laundry} collapsible={false} />
        </>
      );
    case 'program':
      return resting ? (
        <>
          <Setup laundry={laundry} draft={draft} />
          <WhenCard draft={draft} disabled={laundry.state.offline} />
          <StartButton laundry={laundry} draft={draft} />
        </>
      ) : (
        <>
          <SummaryCard laundry={laundry} />
          <NotifyCard laundry={laundry} />
          <HistoryCard deviceId={laundry.device.id} cycles={cycles.cycles.slice(0, 3)} />
        </>
      );
  }
}

function Expanded({ parts }: { readonly parts: Parts }): ReactNode {
  const [tab, setTab] = useState<Tab>('program');
  const { laundry, draft, cycles, runner } = parts;
  return (
    <View className="flex-row items-start gap-section-gap">
      <View className="w-96 gap-section-gap">
        <LaundryStage
          laundry={laundry}
          cycles={cycles}
          estimate={draft.estimate}
          runner={runner}
          starting={draft.starting}
        />
        <CareCard laundry={laundry} />
      </View>
      <View className="min-w-0 flex-1 gap-section-gap">
        <TabsBar
          label="Washer pages"
          active={tab}
          items={TABS.map((entry) => ({
            key: entry.key,
            label: entry.label,
            onPress: (): void => {
              setTab(entry.key);
            },
          }))}
        />
        <TabBody tab={tab} parts={parts} />
      </View>
    </View>
  );
}

function Body({ width, parts }: { readonly width: WidthClass; readonly parts: Parts }): ReactNode {
  if (atLeast(width, 'expanded')) {
    return <Expanded parts={parts} />;
  }
  return atLeast(width, 'medium') ? <Medium parts={parts} /> : <Compact parts={parts} />;
}

export function LaundryPage({ device }: { readonly device: Device }): ReactNode {
  const laundry = useLaundry(device);
  const cycles = useCycles(device.id);
  const draft = useLaundryDraft(laundry);
  const [advice, setAdvice] = useState(false);
  const runner = useRunner(laundry, () => {
    setAdvice(true);
  });
  const { width } = useSizeClass();
  const parts: Parts = { laundry, draft, cycles, runner };
  const sticky = !atLeast(width, 'medium') && laundry.state.resting;
  return (
    <Screen
      header={<DeviceHeader device={device} sectionTitle={null} />}
      maxWidth="detail"
      banner={
        <Banners
          laundry={laundry}
          onAdvice={() => {
            setAdvice(true);
          }}
        />
      }
      {...(sticky ? { footer: <StartButton laundry={laundry} draft={draft} /> } : {})}
    >
      <Body width={width} parts={parts} />
      {advice ? (
        <AdviceSheet
          laundry={laundry}
          runner={runner}
          onClose={() => {
            setAdvice(false);
          }}
        />
      ) : null}
    </Screen>
  );
}
