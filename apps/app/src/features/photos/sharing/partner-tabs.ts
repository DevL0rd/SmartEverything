import { useActiveProfile, useProfiles } from '../../../store/people';
import { partnerTabsOf, type LibraryTab } from '../model/library-tabs';
import { nameOf, partnerSidesOf } from './model';
import { usePhotoSharing } from './queries';

export function usePartnerTabs(): readonly LibraryTab[] {
  const people = useProfiles();
  const me = useActiveProfile()?.id ?? null;
  const partners = usePhotoSharing().data?.partners ?? [];
  return partnerTabsOf(
    partnerSidesOf(partners, me).receiving.map((share) => ({
      id: share.id,
      sharerId: share.sharerId,
      name: nameOf(share.sharerId, people, me),
    })),
  );
}
