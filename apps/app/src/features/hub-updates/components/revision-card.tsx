import type { ReactNode } from 'react';
import type { UpdateRevision } from '@smarteverything/domain';
import { ActivityIndicator, Text as NativeText, View } from 'react-native';
import { Badge, type BadgeTone } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { revisionView, type RevisionView, type StepView } from '../model/revision-view';

const BAR: Readonly<Record<BadgeTone, string>> = {
  neutral: 'bg-surface-3',
  primary: 'bg-primary',
  info: 'bg-info',
  positive: 'bg-positive',
  warning: 'bg-warning',
  critical: 'bg-critical',
};

const TEXT: Readonly<Record<BadgeTone, Tone>> = {
  neutral: 'variant',
  primary: 'primary',
  info: 'info',
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
};

function StepMarker({ step }: { readonly step: StepView }): ReactNode {
  if (step.state === 'running')
    return <ActivityIndicator size="small" colorClassName="accent-primary" />;
  return <Icon name={step.look.icon} size={16} tone={TEXT[step.look.tone]} />;
}

function Step({ step }: { readonly step: StepView }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${step.name}: ${step.look.label}`}
      className="min-w-32 flex-1 basis-0 gap-1.5"
    >
      <View className={cn('h-1.5 rounded-full', BAR[step.look.tone])} />
      <View className="flex-row items-center gap-1.5">
        <Icon name={step.icon} size={16} tone="variant" />
        <Text variant="label" numberOfLines={1} className="min-w-0 shrink">
          {step.name}
        </Text>
      </View>
      <View className="min-h-5 flex-row items-center gap-1">
        <StepMarker step={step} />
        <Text variant="caption" tone={TEXT[step.look.tone]} numberOfLines={1}>
          {step.look.label}
        </Text>
      </View>
    </View>
  );
}

export function StepTrack({ steps }: { readonly steps: RevisionView['steps'] }): ReactNode {
  return (
    <View accessibilityRole="list" className="flex-row flex-wrap gap-x-2 gap-y-3">
      {steps.map((step) => (
        <Step key={step.component} step={step} />
      ))}
    </View>
  );
}

function Failure({ view }: { readonly view: RevisionView }): ReactNode {
  if (view.failure === null) return null;
  return (
    <View
      accessibilityRole="alert"
      className="flex-row items-start gap-2 rounded-md bg-critical/14 px-3 py-2"
    >
      <Icon name="alert" size={18} tone="critical" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="callout" selectable className="web:wrap-anywhere">
          {view.failure}
        </Text>
        {view.rollback === null ? null : (
          <Text variant="footnote" tone="variant">
            {view.rollback}
          </Text>
        )}
      </View>
    </View>
  );
}

export function RevisionHeader({ view }: { readonly view: RevisionView }): ReactNode {
  const now = useMinute();
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <Icon name="route" size={18} tone="variant" />
        <NativeText selectable className="font-mono text-callout text-on-surface">
          {view.commit}
        </NativeText>
        <View className="flex-1" />
        <Badge label={view.look.label} tone={view.look.tone} icon={view.look.icon} />
      </View>
      <Text variant="body" selectable className="web:wrap-anywhere">
        {view.headline ?? 'No release note line in this push.'}
      </Text>
      <Text variant="footnote" tone="variant">
        {view.range === null ? relative(view.at, now) : `${view.range} · ${relative(view.at, now)}`}
      </Text>
    </View>
  );
}

export function RevisionBody({ view }: { readonly view: RevisionView }): ReactNode {
  return (
    <>
      {view.steps.length === 0 ? null : <StepTrack steps={view.steps} />}
      {view.waiting === null ? null : (
        <Text variant="footnote" tone="variant">
          {view.waiting}
        </Text>
      )}
      <Failure view={view} />
    </>
  );
}

export function RevisionCard({ revision }: { readonly revision: UpdateRevision }): ReactNode {
  const view = revisionView(revision);
  return (
    <Card tone={view.failure === null ? 'default' : 'critical'}>
      <RevisionHeader view={view} />
      <RevisionBody view={view} />
    </Card>
  );
}
