import type { AutomationFunctionDetail, AutomationFunctionUser } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Banner } from '../../../../components/banner';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import { BodyPreview, UsedBy, Versions } from './body-and-users';
import { heroModel, interfaceCard, type HeroModel } from './detail-model';
import { InterfaceCard } from './interface-card';
import { SameSteps } from './same-steps';
import { keptLines } from '../edit/kept-model';

export interface FunctionDetailScreenProps {
  readonly detail: AutomationFunctionDetail;
  readonly userId: string | null;
  readonly onEdit: () => void;
  readonly onCopy: () => void;
  readonly onDelete: () => void;
  readonly onOpenUser: (user: AutomationFunctionUser) => void;
  readonly onOpenAutomation: (automationId: string) => void;
}

function Actions({
  hero,
  onEdit,
  onCopy,
  onDelete,
}: {
  readonly hero: HeroModel;
  readonly onEdit: () => void;
  readonly onCopy: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  const builtin = hero.ownership === 'builtin';
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {hero.canEdit ? <Button label="Edit" icon="pencil" onPress={onEdit} /> : null}
      <Button
        label={builtin ? 'Make my own copy' : 'Duplicate'}
        icon="copy"
        variant={hero.canEdit ? 'tonal' : 'filled'}
        onPress={onCopy}
      />
      {hero.canDelete && hero.deleteRefusal === null ? (
        <Button label="Delete" icon="trash" variant="destructive" onPress={onDelete} />
      ) : null}
    </View>
  );
}

function Hero({
  hero,
  onEdit,
  onCopy,
  onDelete,
}: {
  readonly hero: HeroModel;
  readonly onEdit: () => void;
  readonly onCopy: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text variant="title-2">{hero.name}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge label={hero.kindLabel} tone="neutral" />
          <Badge label={hero.versionLabel} tone="primary" />
          <Badge
            label={hero.ownershipLabel}
            tone="neutral"
            {...(hero.canEdit ? {} : { icon: 'lock' as const })}
          />
        </View>
        {hero.description === null ? null : (
          <Text variant="callout" tone="variant">
            {hero.description}
          </Text>
        )}
      </View>
      <Actions hero={hero} onEdit={onEdit} onCopy={onCopy} onDelete={onDelete} />
      {hero.canDelete && hero.deleteRefusal !== null ? (
        <Text variant="footnote" tone="variant">
          {`Delete is unavailable. ${hero.deleteRefusal}`}
        </Text>
      ) : null}
    </View>
  );
}

export function FunctionDetailScreen({
  detail,
  userId,
  onEdit,
  onCopy,
  onDelete,
  onOpenUser,
  onOpenAutomation,
}: FunctionDetailScreenProps): ReactNode {
  const hero = heroModel(detail, userId);
  return (
    <View className="gap-section-gap">
      {hero.ownership === 'builtin' ? (
        <Banner
          tone="info"
          title="Built in, read only"
          body="Make your own copy to change the steps or the interface."
          wrapBody
        />
      ) : null}
      <Hero hero={hero} onEdit={onEdit} onCopy={onCopy} onDelete={onDelete} />
      <InterfaceCard model={interfaceCard(detail.interface)} kept={keptLines(detail.program)} />
      <BodyPreview detail={detail} />
      <UsedBy detail={detail} onOpen={onOpenUser} />
      <SameSteps detail={detail} onOpen={onOpenAutomation} />
      <Versions detail={detail} />
    </View>
  );
}
