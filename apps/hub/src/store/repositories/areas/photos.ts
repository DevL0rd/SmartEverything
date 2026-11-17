import type { StoreContext } from '../../context';
import { PhotoAlbumActivityRepository } from '../photo-album-activity';
import { PhotoAlbumMembersRepository } from '../photo-album-members';
import { PhotoAnalysisRepository } from '../photo-analysis';
import { PhotoArchiveRepository } from '../photo-archive';
import { PhotoDescriptionsRepository } from '../photo-descriptions';
import { PhotoEditsRepository } from '../photo-edits';
import { PhotoEmbeddingsRepository } from '../photo-embeddings';
import { PhotoFacesRepository } from '../photo-faces';
import { PhotoGroupsRepository } from '../photo-groups';
import { PhotoLockedRepository } from '../photo-locked';
import { PhotoMetaOverridesRepository } from '../photo-meta-overrides';
import { PhotoPartnerSharesRepository } from '../photo-partner-shares';

export interface PhotoRepositories {
  readonly photoAnalysis: PhotoAnalysisRepository;
  readonly photoEmbeddings: PhotoEmbeddingsRepository;
  readonly photoFaces: PhotoFacesRepository;
  readonly photoGroups: PhotoGroupsRepository;
  readonly photoEdits: PhotoEditsRepository;
  readonly photoMetaOverrides: PhotoMetaOverridesRepository;
  readonly photoDescriptions: PhotoDescriptionsRepository;
  readonly photoArchive: PhotoArchiveRepository;
  readonly photoLocked: PhotoLockedRepository;
  readonly photoAlbumMembers: PhotoAlbumMembersRepository;
  readonly photoAlbumActivity: PhotoAlbumActivityRepository;
  readonly photoPartnerShares: PhotoPartnerSharesRepository;
}

export function photoRepositories(context: StoreContext): PhotoRepositories {
  return {
    photoAnalysis: new PhotoAnalysisRepository(context),
    photoEmbeddings: new PhotoEmbeddingsRepository(context),
    photoFaces: new PhotoFacesRepository(context),
    photoGroups: new PhotoGroupsRepository(context),
    photoEdits: new PhotoEditsRepository(context),
    photoMetaOverrides: new PhotoMetaOverridesRepository(context),
    photoDescriptions: new PhotoDescriptionsRepository(context),
    photoArchive: new PhotoArchiveRepository(context),
    photoLocked: new PhotoLockedRepository(context),
    photoAlbumMembers: new PhotoAlbumMembersRepository(context),
    photoAlbumActivity: new PhotoAlbumActivityRepository(context),
    photoPartnerShares: new PhotoPartnerSharesRepository(context),
  };
}
