import {
  PHOTOS_ENDPOINTS,
  type PhotoPlace as DomainPlace,
  type PlaceCluster,
  type PlaceCountry,
} from '@smarteverything/domain';
import { photoActor } from './actor';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import {
  placeNumber,
  type PhotoMapClusters,
  type PhotoPlace,
  type PhotoPlaceList,
} from './places-schema';

const E = PHOTOS_ENDPOINTS;

export function domainPlace(
  place: PhotoPlace,
  count: number,
  coverItemId: string | null,
): DomainPlace {
  return {
    id: placeNumber(place.id),
    name: place.name,
    admin: place.admin,
    country: place.countryName,
    countryCode: place.country,
    lat: place.lat,
    lon: place.lon,
    count,
    coverItemId,
  };
}

export function domainCountries(list: PhotoPlaceList): PlaceCountry[] {
  return list.countries.map((country) => ({
    countryCode: country.country,
    country: country.name,
    count: country.count,
    coverItemId: country.places[0]?.coverItemId ?? null,
    places: country.places.map((entry) => domainPlace(entry.place, entry.count, entry.coverItemId)),
  }));
}

export function domainClusters(found: PhotoMapClusters): PlaceCluster[] {
  return found.clusters.map((cluster) => ({
    geohash: cluster.key,
    lat: cluster.lat,
    lon: cluster.lon,
    count: cluster.count,
    coverItemId: cluster.coverItemId,
    placeId: null,
  }));
}

export interface PhotoPlaceRoutes {
  readonly listPlaces: Bound<typeof E.listPlaces>;
  readonly readPlace: Bound<typeof E.readPlace>;
  readonly listPlaceClusters: Bound<typeof E.listPlaceClusters>;
}

export function photoPlaceRoutes(store: Store): PhotoPlaceRoutes {
  return {
    listPlaces: bound(E.listPlaces, async ({ caller }) =>
      domainCountries(await store.host.read('photoPlaceList', { actor: photoActor(caller) })),
    ),
    readPlace: bound(E.readPlace, async ({ params, caller }) => {
      const detail = await store.host.read('photoPlaceDetail', {
        actor: photoActor(caller),
        placeId: String(params.placeId),
      });
      return domainPlace(detail.place, detail.items, detail.coverItemId);
    }),
    listPlaceClusters: bound(E.listPlaceClusters, async ({ query, caller }) =>
      domainClusters(
        await store.host.read('photoPlaceClusters', { actor: photoActor(caller), query }),
      ),
    ),
  };
}
