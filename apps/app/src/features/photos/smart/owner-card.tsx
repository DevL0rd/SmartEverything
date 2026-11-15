import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { PhotoAiModelChoice, PhotoAiModelRole, PhotoAiStatus } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { confirm } from '../../../components/confirm-store';
import { ErrorState } from '../../../components/error-state';
import { Select } from '../../../components/select';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { useMoney, type Money } from '../../region';
import { reanalysePhotos, setPhotoAiModels } from './api';
import { MODEL_ROWS, modelOptionsOf, photosLine } from './model';
import { invalidateAiStatus, usePhotoAiModels } from './queries';

export const MODELS_NOTE =
  'One set of models serves the whole home so search stays consistent. A new model applies to new photos; Re-analyse library redoes the rest.';

function ModelRow({
  id,
  status,
  choices,
  disabled,
  mutation,
}: {
  readonly id: PhotoAiModelRole;
  readonly status: PhotoAiStatus;
  readonly choices: readonly PhotoAiModelChoice[];
  readonly disabled: boolean;
  readonly mutation: MutationState;
}): ReactNode {
  const row = MODEL_ROWS.find((entry) => entry.id === id);
  const client = useQueryClient();
  const money = useMoney();
  const current = status.models[id];
  if (row === undefined) return null;
  return (
    <View className="gap-1">
      <Select
        label={row.title}
        options={modelOptionsOf(choices, current, money.cost)}
        value={current}
        searchable
        disabled={disabled}
        onChange={(model) => {
          if (model === current) return;
          mutation.run(() => setPhotoAiModels({ [id]: model }), {
            failure: 'The model was not changed',
            label: 'photos.smart.models',
            onDone: () => {
              invalidateAiStatus(client);
            },
          });
        }}
      />
      <Text variant="footnote" tone="variant">
        {row.use}
      </Text>
    </View>
  );
}

function ModelRows({
  status,
  disabled,
  mutation,
}: {
  readonly status: PhotoAiStatus;
  readonly disabled: boolean;
  readonly mutation: MutationState;
}): ReactNode {
  const catalogue = usePhotoAiModels();
  if (catalogue.isError) {
    return (
      <ErrorState
        error={catalogue.error}
        retry={() => {
          background(catalogue.refetch(), 'photos.smart.models_failed');
        }}
      />
    );
  }
  if (catalogue.data === undefined) {
    return (
      <View className="gap-3" accessibilityLabel="Loading the models">
        {MODEL_ROWS.map((row) => (
          <Skeleton key={row.id} shape="block" className="h-14" />
        ))}
      </View>
    );
  }
  const offered = catalogue.data;
  return MODEL_ROWS.map((row) => (
    <ModelRow
      key={row.id}
      id={row.id}
      status={status}
      choices={offered[row.id]}
      disabled={disabled}
      mutation={mutation}
    />
  ));
}

export function reanalyseConfirmOf(
  status: PhotoAiStatus,
  money: Money,
): Parameters<typeof confirm>[0] {
  return {
    title: 'Re-analyse the library?',
    body: `Photos analysed with an older model are analysed again with the current ones. ${
      status.estimateMicros === 0
        ? 'Nothing is left to pay for.'
        : `This costs about ${money.cost(status.estimateMicros)}.`
    }`,
    confirmLabel: 'Re-analyse',
  };
}

function useReanalyse(status: PhotoAiStatus, mutation: MutationState): () => void {
  const money = useMoney();
  const client = useQueryClient();
  return (): void => {
    background(
      confirm(reanalyseConfirmOf(status, money)).then((accepted) => {
        if (!accepted) return;
        mutation.run(() => reanalysePhotos(status.estimateMicros), {
          failure: 'The library was not re-analysed',
          label: 'photos.smart.reanalyse',
          onDone: (result) => {
            invalidateAiStatus(client);
            notify({ message: `${photosLine(result.queued)} queued for analysis` });
          },
        });
      }),
      'photos.smart.reanalyse_confirm_failed',
    );
  };
}

export function OwnerCard({
  status,
  live,
}: {
  readonly status: PhotoAiStatus;
  readonly live: boolean;
}): ReactNode {
  const mutation = useMutationState();
  const reanalyse = useReanalyse(status, mutation);
  const disabled = !live || mutation.busy;
  return (
    <Card title="Models for the home" icon="settings">
      <View className="gap-3">
        <Text variant="footnote" tone="variant">
          {MODELS_NOTE}
        </Text>
        <ModelRows status={status} disabled={disabled} mutation={mutation} />
        <View className="flex-row flex-wrap items-center gap-3 border-t border-outline-variant pt-3">
          <Button
            label="Re-analyse library"
            icon="refresh"
            variant="outlined"
            disabled={disabled || !status.hasKey}
            onPress={reanalyse}
          />
          {status.hasKey ? null : (
            <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
              Needs an OpenRouter key
            </Text>
          )}
        </View>
      </View>
    </Card>
  );
}
