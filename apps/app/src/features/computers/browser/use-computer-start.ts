import { background } from '@smarteverything/logging';
import type { FileLocation } from '../../files';
import { useComputerReach, type ComputerReach } from '../data/computer-scopes';
import { placeOfPath } from '../source/computer-crumbs';
import { usePlacesData } from '../source/computer-files-data';
import { useReach } from '../source/computer-reach';
import { useComputerSource, type ComputerSource } from '../source/computer-source';
import { locationOfParam } from './computer-route';

export interface StartFailure {
  readonly error: unknown;
  readonly retry: () => void;
}

export interface ComputerStart {
  readonly source: ComputerSource;
  readonly reach: ComputerReach;
  readonly location: FileLocation | null;
  readonly failure: StartFailure | null;
}

const UNLISTED: FileLocation = placeOfPath('/');

export function useComputerStart(deviceId: string, path: string | undefined): ComputerStart {
  const reach = useComputerReach(deviceId);
  const source = useComputerSource(deviceId, reach.name);
  const files = useReach(deviceId);
  const blocked = !reach.online || files.scope === false;
  const places = usePlacesData(deviceId, !blocked);
  const location = locationOfParam(path, files.places, places.data?.home ?? null);
  const failure: StartFailure | null =
    location === null && !blocked && places.isError
      ? {
          error: places.error,
          retry: (): void => {
            background(places.refetch(), 'files.places_refetch_failed');
          },
        }
      : null;
  return { source, reach, location: location ?? (blocked ? UNLISTED : null), failure };
}
