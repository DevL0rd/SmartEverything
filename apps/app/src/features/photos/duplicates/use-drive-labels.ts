import { useProfiles } from '../../../store/people';
import { useDriveRootPlaces, useViewerId } from '../../drive';
import { driveLabelsOf, type SourceLabels } from './model';

export function useDriveLabels(): SourceLabels {
  const roots = useDriveRootPlaces();
  const profiles = useProfiles();
  const viewerId = useViewerId();
  return driveLabelsOf({ roots, profiles, viewerId });
}
