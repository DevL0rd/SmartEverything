import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { AiModelSearchMetrics, AiModelSearchSource } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { ReasonLine } from '../../../../components/reason-line';
import { Text } from '../../../../components/text';
import { useMoney, type Money } from '../../../region';
import { contextText, pricePerMillionText } from '../../data/cost';
import { effortLabel } from '../efforts';
import type { ModelChoice } from '../model-choice';
import { openSourceWebsite } from '../model-search-source';
import { ProviderLogo } from '../provider-logo';
import type { PrimaryAction } from './library-model';
import type { LibraryRow } from './library-rows';

export function Fact({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-0.5">
      <Text variant="caption" tone="variant">
        {title}
      </Text>
      {children}
    </View>
  );
}

function priceText(model: ModelChoice, money: Money): string {
  if (model.billing === 'Subscription') return 'Included in your plan';
  if (model.price.variable) return 'Varies';
  const { inputPerMillion, outputPerMillion } = model.price;
  return `Input ${pricePerMillionText(inputPerMillion, money)} · Output ${pricePerMillionText(outputPerMillion, money)}`;
}

function thinkingText(model: ModelChoice): string {
  return model.efforts.length === 0
    ? 'None'
    : ['Default', ...model.efforts.map(effortLabel)].join(', ');
}

function Ranking({
  metrics,
  source,
}: {
  readonly metrics: AiModelSearchMetrics | undefined;
  readonly source: AiModelSearchSource | undefined;
}): ReactNode {
  const rank = metrics?.intelligence_rank ?? null;
  if (rank === null || source === undefined) return null;
  return (
    <Fact title="Intelligence">
      <Text variant="body-strong">
        {source.total === null ? `#${String(rank)}` : `#${String(rank)} of ${String(source.total)}`}
      </Text>
      <Text variant="caption" tone="variant">{`Source: ${source.source}`}</Text>
      <View className="flex-row justify-start">
        <Button
          label="Source website"
          variant="text"
          icon="externalLink"
          onPress={(): void => {
            openSourceWebsite(source.source_url);
          }}
        />
      </View>
    </Fact>
  );
}

export interface LibraryDetailProps {
  readonly row: LibraryRow;
  readonly metrics: AiModelSearchMetrics | undefined;
  readonly source: AiModelSearchSource | undefined;
  readonly action: PrimaryAction | null;
}

export function LibraryDetail({ row, metrics, source, action }: LibraryDetailProps): ReactNode {
  const money = useMoney();
  const { model } = row.candidate;
  return (
    <View className="min-h-0 flex-1">
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <ProviderLogo provider={model.provider} name={model.providerLabel} />
          <View className="min-w-0 flex-1">
            <Text variant="title-3" accessibilityRole="header">
              {model.name}
            </Text>
            <Text variant="footnote" tone="variant">
              {model.providerLabel}
            </Text>
          </View>
        </View>
        <Ranking metrics={metrics} source={source} />
        <Fact title="Prices per 1M tokens">
          <Text variant="callout">{priceText(model, money)}</Text>
        </Fact>
        <Fact title="Context window">
          <Text variant="callout">{contextText(model.contextLength) ?? 'Unknown'}</Text>
        </Fact>
        {row.where === null ? null : (
          <Fact title="Supplied by">
            <Text variant="callout">{row.where}</Text>
          </Fact>
        )}
        <Fact title="Thinking levels">
          <Text variant="callout">{thinkingText(model)}</Text>
        </Fact>
        {row.reason === null ? null : (
          <ReasonLine text={row.reason} icon="warning" tone="warning" />
        )}
      </ScrollView>
      {action === null ? null : (
        <View className="flex-row p-3">
          <Button
            label={action.label}
            size="lg"
            grow
            disabled={action.run === null}
            {...(action.run === null ? {} : { onPress: action.run })}
          />
        </View>
      )}
    </View>
  );
}
