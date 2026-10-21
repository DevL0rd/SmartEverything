import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { ImageEndpoint } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import { useMoney } from '../../../region';
import { Fact } from '../library/library-detail';
import type { PrimaryAction } from '../library/library-model';
import { ProviderLogo } from '../provider-logo';
import { priceDetails } from './image-price';
import { makerOf, titleOf } from './image-rows';
import { takesReferences } from './use-image-models';

export interface ImageDetailProps {
  readonly endpoint: ImageEndpoint;
  readonly isDefault: boolean;
  readonly action: PrimaryAction | null;
}

function Facts({ endpoint }: { readonly endpoint: ImageEndpoint }): ReactNode {
  const money = useMoney();
  return (
    <>
      <Fact title="Prices">
        {priceDetails(endpoint, money.dollars).map((line) => (
          <Text key={`${line.label}${line.text}`} variant="callout">
            {`${line.label}: ${line.text}`}
          </Text>
        ))}
      </Fact>
      <Fact title="Reference images">
        <Text variant="callout">
          {takesReferences(endpoint) ? 'Can edit and combine images' : 'Generates only'}
        </Text>
      </Fact>
      <Fact title="Live preview">
        <Text variant="callout">{endpoint.supports_streaming ? 'Yes' : 'No'}</Text>
      </Fact>
      <Fact title="Supplied by">
        <Text variant="callout">{`OpenRouter · ${titleOf(endpoint.provider_tag)}`}</Text>
      </Fact>
      <Fact title="Model id">
        <Text variant="callout">{endpoint.model}</Text>
      </Fact>
    </>
  );
}

export function ImageDetail({ endpoint, isDefault, action }: ImageDetailProps): ReactNode {
  const maker = titleOf(makerOf(endpoint));
  return (
    <View className="min-h-0 flex-1">
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <ProviderLogo provider={makerOf(endpoint)} name={maker} />
          <View className="min-w-0 flex-1">
            <Text variant="title-3" accessibilityRole="header">
              {endpoint.name}
            </Text>
            <Text variant="footnote" tone="variant">
              {isDefault ? `${maker} · Default image model` : maker}
            </Text>
          </View>
        </View>
        <Facts endpoint={endpoint} />
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
