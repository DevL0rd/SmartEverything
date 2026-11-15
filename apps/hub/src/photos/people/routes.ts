import { PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { DONE_REPLY, bound, type Bound } from '../../server/router';
import type { Store } from '../../store/store';
import { photoActor } from '../actor';
import type { PhotoSearch } from './search';
import type { PeopleService } from './service';
import type { PhotoSuggest } from './suggest';

const E = PHOTOS_ENDPOINTS;

export interface PhotoPeopleRoutes {
  readonly listPhotoGroups: Bound<typeof E.listPhotoGroups>;
  readonly readPhotoGroup: Bound<typeof E.readPhotoGroup>;
  readonly updatePhotoGroup: Bound<typeof E.updatePhotoGroup>;
  readonly mergePhotoGroups: Bound<typeof E.mergePhotoGroups>;
  readonly dismissPhotoMergeSuggestion: Bound<typeof E.dismissPhotoMergeSuggestion>;
  readonly removePhotoGroupFaces: Bound<typeof E.removePhotoGroupFaces>;
  readonly readPhotoFaces: Bound<typeof E.readPhotoFaces>;
  readonly suggestPhotoSearch: Bound<typeof E.suggestPhotoSearch>;
  readonly readLibraryBuckets: Bound<typeof E.readLibraryBuckets>;
  readonly readLibraryPage: Bound<typeof E.readLibraryPage>;
}

export function photoPeopleRoutes(
  store: Store,
  people: PeopleService,
  search: PhotoSearch,
  suggest: PhotoSuggest,
): PhotoPeopleRoutes {
  return {
    listPhotoGroups: bound(E.listPhotoGroups, ({ query, caller }) =>
      people.people(photoActor(store, caller), query.kind),
    ),
    readPhotoGroup: bound(E.readPhotoGroup, ({ params, caller }) =>
      people.group(photoActor(store, caller), params.groupId),
    ),
    updatePhotoGroup: bound(E.updatePhotoGroup, ({ params, body, caller }) =>
      people.update(photoActor(store, caller), params.groupId, body),
    ),
    mergePhotoGroups: bound(E.mergePhotoGroups, ({ body, caller }) =>
      people.merge(photoActor(store, caller), body),
    ),
    dismissPhotoMergeSuggestion: bound(E.dismissPhotoMergeSuggestion, ({ body, caller }) => {
      people.dismissMerge(photoActor(store, caller), body);
      return DONE_REPLY;
    }),
    removePhotoGroupFaces: bound(E.removePhotoGroupFaces, ({ params, body, caller }) =>
      people.removeFaces(photoActor(store, caller), params.groupId, body),
    ),
    readPhotoFaces: bound(E.readPhotoFaces, ({ params, caller }) =>
      people.itemFaces(photoActor(store, caller), params.itemId),
    ),
    suggestPhotoSearch: bound(E.suggestPhotoSearch, ({ query, caller }) =>
      suggest.read(photoActor(store, caller), query.q),
    ),
    readLibraryBuckets: bound(E.readLibraryBuckets, ({ query, caller }) =>
      search.buckets(photoActor(store, caller), query),
    ),
    readLibraryPage: bound(E.readLibraryPage, ({ params, query, caller }) =>
      search.page(photoActor(store, caller), params.month, query),
    ),
  };
}
