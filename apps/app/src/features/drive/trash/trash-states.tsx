import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { href } from '../../../app-shell/hrefs';
import { cn } from '../../../design/cn';
import { MEMBER_NOTE, OWNER_NOTE } from './trash-copy';
import type { TrashView } from './use-trash';

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'] as const;

export function TrashNote({ owner }: { readonly owner: boolean }): ReactNode {
  return (
    <View className="flex-row items-start gap-2 px-gutter py-4">
      <Icon name="info" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {owner ? OWNER_NOTE : MEMBER_NOTE}
      </Text>
    </View>
  );
}

function TrashSkeleton({ wide }: { readonly wide: boolean }): ReactNode {
  return (
    <View aria-label="Loading Trash" className="gap-3 px-gutter pb-2">
      <View className={cn('gap-3', wide && 'flex-row')}>
        <Skeleton shape="tile" className={cn('h-40', wide && 'flex-1')} />
        <Skeleton shape="tile" className={cn('h-40', wide && 'flex-1')} />
      </View>
      <View className="h-10 w-96 max-w-full justify-center">
        <Skeleton shape="line" />
      </View>
      <View className="h-12" />
      {SKELETON_ROWS.map((key) => (
        <View key={key} className="h-14 flex-row items-center gap-3">
          <Skeleton shape="circle" className="size-7 rounded-sm" />
          <View className="flex-1 gap-2">
            <Skeleton shape="text" className="w-48" />
            <Skeleton shape="text" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function TrashEmpty({
  view,
  owner,
  wide,
}: {
  readonly view: TrashView;
  readonly owner: boolean;
  readonly wide: boolean;
}): ReactNode {
  if (view.status === 'loading') return <TrashSkeleton wide={wide} />;
  if (view.status === 'error') {
    return (
      <View className="px-gutter">
        <ErrorState error={view.error} retry={view.retry} page />
      </View>
    );
  }
  return (
    <View className="gap-2 pt-6">
      <EmptyState
        icon="trash"
        title="Trash is empty"
        body="Files and folders you delete stay here for a year, then leave for good."
        action={
          <Button label="Open My Drive" variant="tonal" icon="hardDrive" href={href.drive()} />
        }
      />
      <TrashNote owner={owner} />
    </View>
  );
}

export function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Offline · showing the last snapshot"
      body="Restoring and deleting need your home hub."
      wrapBody
    />
  );
}
