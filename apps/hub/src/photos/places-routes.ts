import {
  PHOTOS_ENDPOINTS,
  PLACE_PARAMS,
  type PhotoPlace as DomainPlace,
  type PlaceCluster,
  type PlaceCountry,
} from '@smarteverything/domain';
import type { DriveActor } from '../drive/service-read';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import { bound, type Bound } from '../server/router';
import type { Store } from '../store/store';
import type { PlaceQueries } from './places-queries';
import type { PhotoMapClusters, PhotoPlace, PhotoPlaceList } from './places-schema';

const E = PHOTOS_ENDPOINTS;

function actorOf(store: Store, caller: Caller): DriveActor {
  return { profileId: profileIdOf(store, caller), owner: roleOfCaller(caller) === 'owner' };
}

export function placeNumber(id: string): number {
  return PLACE_PARAMS.shape.placeId.parse(id);
}

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

export function photoPlaceRoutes(store: Store, queries: PlaceQueries): PhotoPlaceRoutes {
  return {
    listPlaces: bound(E.listPlaces, ({ caller }) =>
      domainCountries(queries.list(actorOf(store, caller))),
    ),
    readPlace: bound(E.readPlace, ({ params, caller }) => {
      const detail = queries.detail(actorOf(store, caller), String(params.placeId));
      return domainPlace(detail.place, detail.items, detail.coverItemId);
    }),
    listPlaceClusters: bound(E.listPlaceClusters, ({ query, caller }) =>
      domainClusters(queries.clusters(actorOf(store, caller), query)),
    ),
  };
}
