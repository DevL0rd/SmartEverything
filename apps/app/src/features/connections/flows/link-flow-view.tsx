import type { ReactNode } from 'react';
import { View } from 'react-native';
import { PROVIDER_INFO, type Provider, type ProviderLinkRow } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { FlowButton } from './flow-button';
import { DoneMark } from '../../../components/done-mark';
import { FlowFrame } from '../../../components/flow-frame';
import { ProgressSteps, stepsAt } from '../../../components/progress-steps';
import { Text } from '../../../components/text';
import { plural } from '../../../format/text';
import { useDevices } from '../../../store/selectors';
import { stepIndexOf } from '../model/link-stage';
import { problemTitle } from '../model/problems';
import { PromptBody, type ScanPrompt } from './prompt-body';
import { leaveFlow } from './leave-flow';
import type { LinkFlow } from './use-link-flow';

function DevicePreview({ provider }: { readonly provider: Provider }): ReactNode {
  const devices = useDevices({ includeHidden: true }).filter(
    (device) => device.provider === provider,
  );
  if (devices.length === 0) {
    return null;
  }
  return (
    <View className="gap-1 rounded-lg bg-surface-2 p-card-pad">
      {devices.slice(0, 5).map((device) => (
        <Text key={device.id} variant="callout" numberOfLines={1}>
          {device.label}
        </Text>
      ))}
      {devices.length > 5 ? (
        <Text variant="footnote" tone="variant">
          {`and ${plural(devices.length - 5, 'more device')}`}
        </Text>
      ) : null}
    </View>
  );
}

export function LinkDone({
  row,
  extra,
}: {
  readonly row: ProviderLinkRow;
  readonly extra: ReactNode;
}): ReactNode {
  return (
    <View className="gap-5">
      <View className="items-center gap-2 pt-2">
        <DoneMark />
        <Text variant="title-2" align="center">
          {`${PROVIDER_INFO[row.provider].name} connected`}
        </Text>
        <Text variant="callout" tone="variant" align="center">
          {plural(row.device_count, 'device')}
        </Text>
      </View>
      <DevicePreview provider={row.provider} />
      {extra}
    </View>
  );
}

export interface LinkFlowViewProps {
  readonly provider: Provider;
  readonly title: string;
  readonly labels: readonly string[];
  readonly flow: LinkFlow;
  readonly form: ReactNode;
  readonly formFooter: ReactNode;
  readonly doneExtra?: ReactNode;
  readonly wide?: boolean;
  readonly renderScan?: (prompt: ScanPrompt) => ReactNode;
  readonly failed?: { readonly body: ReactNode; readonly footer: ReactNode };
}

function Body({
  provider,
  labels,
  flow,
  form,
  doneExtra,
  renderScan,
  failed,
}: LinkFlowViewProps): ReactNode {
  const { stage } = flow;
  switch (stage.kind) {
    case 'form':
      return form;
    case 'working':
      return <ProgressSteps steps={stepsAt(labels, stepIndexOf(stage))} />;
    case 'prompt':
      return (
        <View className="gap-6">
          <ProgressSteps steps={stepsAt(labels, stepIndexOf(stage))} />
          {stage.prompt.kind === 'scan_qr' ? (
            renderScan?.(stage.prompt)
          ) : (
            <PromptBody provider={provider} prompt={stage.prompt} />
          )}
        </View>
      );
    case 'done':
      return <LinkDone row={stage.row} extra={doneExtra} />;
    case 'failed':
      return failed !== undefined ? (
        failed.body
      ) : (
        <Banner
          tone="critical"
          title={problemTitle(provider, stage.problem)}
          {...(stage.detail === null ? {} : { body: stage.detail })}
        />
      );
  }
}

function Footer({ flow, formFooter, failed }: LinkFlowViewProps): ReactNode {
  switch (flow.stage.kind) {
    case 'form':
      return formFooter;
    case 'working':
    case 'prompt':
      return <FlowButton label="Stop" variant="text" onPress={flow.cancel} />;
    case 'done':
      return <FlowButton label="Done" onPress={leaveFlow} />;
    case 'failed':
      return failed !== undefined ? (
        failed.footer
      ) : (
        <FlowButton label="Try again" onPress={flow.restart} />
      );
  }
}

export function LinkFlowView(props: LinkFlowViewProps): ReactNode {
  return (
    <FlowFrame
      title={props.title}
      onCancel={props.flow.cancel}
      footer={<Footer {...props} />}
      {...(props.wide === true ? { wide: true } : {})}
    >
      <Body {...props} />
    </FlowFrame>
  );
}
