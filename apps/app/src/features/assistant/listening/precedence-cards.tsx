import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LISTENING_STANDARD } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';

interface Step {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

const STEPS: readonly Step[] = [
  {
    icon: 'users',
    title: 'Discord call',
    body: 'The bot is in a voice channel: a wake heard there wins and the reply stays in Discord. Computers stop listening.',
  },
  { icon: 'radio', title: 'Walkie channel', body: 'Comes before cameras, phones and computers.' },
  {
    icon: 'audioLines',
    title: 'Loudest wins',
    body: 'Everything else by how loud the wake was. A louder source can take over within a second, even mid-greeting.',
  },
];

function StepRow({
  step,
  number,
  active,
}: {
  readonly step: Step;
  readonly number: number;
  readonly active: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'flex-row gap-3 rounded-md px-2 py-2.5',
        number > 1 && 'border-t border-outline-variant',
        active && 'bg-primary-container',
      )}
    >
      <View
        aria-hidden
        className={cn(
          'size-6 items-center justify-center rounded-full',
          active ? 'bg-primary' : 'bg-on-surface-faint',
        )}
      >
        <Text variant="caption" tone={active ? 'onPrimary' : 'default'}>
          {String(number)}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Icon name={step.icon} size={16} />
          <Text variant="callout">{step.title}</Text>
          {active ? <Badge label="Active now" tone="primary" /> : null}
        </View>
        <Text variant="footnote" tone="variant">
          {step.body}
        </Text>
      </View>
    </View>
  );
}

export function PrecedenceCard({ call }: { readonly call: boolean }): ReactNode {
  return (
    <Card title="How a wake is decided" icon="route">
      <View accessibilityRole="list">
        {STEPS.map((step, index) => (
          <StepRow key={step.title} step={step} number={index + 1} active={index === 0 && call} />
        ))}
      </View>
    </Card>
  );
}

function onOff(value: boolean): string {
  return value ? 'on' : 'off';
}

function Chip({ on, label }: { readonly on: boolean; readonly label: string }): ReactNode {
  return (
    <View
      className={cn(
        'min-h-8 flex-row items-center gap-1.5 rounded-full border bg-surface-2 px-3',
        on ? 'border-positive/50' : 'border-outline',
      )}
    >
      <Icon name={on ? 'check' : 'minus'} size={16} tone={on ? 'positive' : 'variant'} />
      <Text variant="footnote">{label}</Text>
    </View>
  );
}

export function DefaultsCard(): ReactNode {
  return (
    <Card title="New devices start like this" icon="plus">
      <View className="flex-row flex-wrap gap-2">
        <Chip on={LISTENING_STANDARD.wake} label={`Wake ${onOff(LISTENING_STANDARD.wake)}`} />
        <Chip
          on={LISTENING_STANDARD.transcribe}
          label={`Write down ${onOff(LISTENING_STANDARD.transcribe)}`}
        />
        <Chip on label="Walkie: both on" />
      </View>
      <Text variant="footnote" tone="variant">
        Applies to new phones and computers. Walkie channels always keep both on.
      </Text>
    </Card>
  );
}
