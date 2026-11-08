import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { MediaInfo, PhotoPlace } from '@smarteverything/domain';
import type { AppHref } from '../../../components/app-href';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { MiniMap } from '../world-map';
import type { AskAbout } from './ask';
import {
  addedLine,
  askLabel,
  cameraLine,
  exposureChips,
  fileDetail,
  fileLine,
  folderOf,
  lensLine,
  placeLine,
  takenLine,
  takenSourceLine,
  wallTimeOf,
  type MediaItem,
} from './info-model';
import { ThisDayStrip } from './this-day-strip';

export const LOCATION_NOTE = 'Location is removed from links shared outside the home';

export interface InfoContent {
  readonly item: MediaItem;
  readonly media: MediaInfo | null;
  readonly place: PhotoPlace | null;
  readonly library: string | null;
  readonly addedBy: string | null;
  readonly removeLocation: boolean;
  readonly albums: readonly MenuItem[];
  readonly driveHref: AppHref;
  readonly ask: AskAbout;
  readonly onOpenItem: (itemId: string) => void;
}

function Row({
  icon,
  children,
}: {
  readonly icon: IconName;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row gap-3 py-2">
      <Icon name={icon} size={20} tone="variant" />
      <View className="min-w-0 flex-1 gap-0.5">{children}</View>
    </View>
  );
}

function Lines({
  main,
  detail,
}: {
  readonly main: string;
  readonly detail: string | null;
}): ReactNode {
  return (
    <>
      <Text variant="callout" numberOfLines={2}>
        {main}
      </Text>
      {detail === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {detail}
        </Text>
      )}
    </>
  );
}

function CameraRow({ item }: { readonly item: MediaItem }): ReactNode {
  const camera = cameraLine(item.camera);
  const lens = lensLine(item.camera, item.exposure);
  const chips = exposureChips(item.exposure);
  if (camera === null && lens === null && chips.length === 0) return null;
  return (
    <Row icon="camera">
      <Lines main={camera ?? lens ?? 'Camera'} detail={camera === null ? null : lens} />
      {chips.length === 0 ? null : (
        <View className="flex-row flex-wrap gap-1 pt-1.5">
          {chips.map((chip) => (
            <Badge key={chip} label={chip} />
          ))}
        </View>
      )}
    </Row>
  );
}

function TakenRow({
  item,
  media,
}: {
  readonly item: MediaItem;
  readonly media: MediaInfo | null;
}): ReactNode {
  if (item.takenAt === null) return null;
  const offset = media?.tzOffsetMin ?? null;
  return (
    <Row icon="clock">
      <Lines
        main={takenLine(wallTimeOf(item.takenAt, offset))}
        detail={takenSourceLine(media?.timeSource ?? null, offset)}
      />
    </Row>
  );
}

function LocationRow({ content }: { readonly content: InfoContent }): ReactNode {
  const { item, place } = content;
  if (item.place === null) return null;
  const name = place === null ? 'Where this was taken' : placeLine(place);
  return (
    <Row icon="mapPin">
      <Text variant="callout">{name}</Text>
      <MiniMap point={item.place} label={`Map of ${name}`} className="mt-1.5 h-30 rounded-md" />
      {content.removeLocation ? (
        <View className="flex-row items-center gap-1.5 pt-1.5">
          <Icon name="locoff" size={16} tone="variant" />
          <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
            {LOCATION_NOTE}
          </Text>
        </View>
      ) : null}
    </Row>
  );
}

function AlbumsRow({ items }: { readonly items: readonly MenuItem[] }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, 'Add to album');
  return (
    <Row icon="layers">
      <View ref={ref} collapsable={false} className="flex-row">
        <Button label="Add to album" icon="plus" variant="text" onPress={open} />
      </View>
      {menu}
    </Row>
  );
}

export function InfoRows({ content }: { readonly content: InfoContent }): ReactNode {
  const { item } = content;
  const folder = folderOf(item.relPath);
  return (
    <View className="gap-1">
      <CameraRow item={item} />
      <TakenRow item={item} media={content.media} />
      <Row icon="image">
        <Lines main={fileLine(item)} detail={fileDetail(item)} />
      </Row>
      <Row icon="folder">
        <Lines
          main={folder === '' ? 'Top of the library folder' : folder}
          detail={addedLine(item, content.library, content.addedBy)}
        />
      </Row>
      <LocationRow content={content} />
      <AlbumsRow items={content.albums} />
      <ThisDayStrip item={item} media={content.media} onOpen={content.onOpenItem} />
      <View className="gap-2 pt-4">
        <Button
          label={askLabel(item)}
          icon="sparkles"
          variant="tonal"
          disabled={content.ask.hint !== null}
          {...(content.ask.hint === null ? {} : { hint: content.ask.hint })}
          onPress={content.ask.run}
        />
        <Button label="Show in Drive" icon="folder" variant="outlined" href={content.driveHref} />
      </View>
    </View>
  );
}
