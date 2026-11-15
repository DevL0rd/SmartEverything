import { useMemo } from 'react';
import type { PhotoBox, PhotoPeople } from '@smarteverything/domain';
import { usePhotoPeople } from '../people/queries';
import { usePhotoSuggestions } from '../smart/queries';
import { NO_SMART_HITS, type SmartHits } from './suggest';

export function boxesOf(people: PhotoPeople | undefined): ReadonlyMap<string, PhotoBox> {
  return new Map((people?.groups ?? []).map((group) => [group.id, group.coverBox]));
}

export function useSmartHits(text: string, enabled: boolean): SmartHits {
  const suggestions = usePhotoSuggestions(enabled ? text : '').data;
  const people = usePhotoPeople().data;
  return useMemo(
    () =>
      enabled && suggestions !== undefined
        ? { suggestions, boxes: boxesOf(people) }
        : NO_SMART_HITS,
    [enabled, suggestions, people],
  );
}
