import type { AutomationFunctionUser } from '@smarteverything/domain';
import type { FunctionDetail } from '../../data/graph-adapter';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { Text } from '../../../../components/text';
import { useSizeClass } from '../../../../design/size-class';
import { BodyPreview, UsedBy, Versions } from './body-and-users';
import { heroModel, interfaceCard, type HeroModel } from './detail-model';
import { InterfaceCard } from './interface-card';
import { SameSteps } from './same-steps';
import { keptLines } from '../edit/kept-model';

export interface FunctionDetailScreenProps {
  readonly detail: FunctionDetail;
  readonly userId: string | null;
  readonly onEdit: () => void;
  readonly onCopy: () => void;
  readonly onDelete: () => void;
  readonly onOpenUser: (user: AutomationFunctionUser) => void;
  readonly onOpenAutomation: (automationId: string) => void;
}

const COLUMN = 'min-w-0 max-w-reading grow shrink basis-80 gap-section-gap';

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
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {hero.canEdit ? <Button label="Edit" icon="pencil" onPress={onEdit} /> : null}
      <Button
        label="Duplicate"
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
  const { header } = useSizeClass();
  return (
    <View className="gap-3">
      <View className="gap-1">
        {header === 'standard' ? <Text variant="title-2">{hero.name}</Text> : null}
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
    <View className="flex-row flex-wrap items-start gap-section-gap">
      <View className={COLUMN}>
        <Hero hero={hero} onEdit={onEdit} onCopy={onCopy} onDelete={onDelete} />
        <InterfaceCard model={interfaceCard(detail.interface)} kept={keptLines(detail.program)} />
      </View>
      <View className="min-w-0 grow shrink basis-80 flex-row flex-wrap items-start gap-section-gap">
        <View className={COLUMN}>
          <BodyPreview detail={detail} />
          <UsedBy detail={detail} onOpen={onOpenUser} />
        </View>
        <View className={COLUMN}>
          <SameSteps detail={detail} onOpen={onOpenAutomation} />
          <Versions detail={detail} />
        </View>
      </View>
    </View>
  );
}
