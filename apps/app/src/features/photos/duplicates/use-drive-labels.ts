import { useProfiles } from '../../../store/people';
import { useDriveRoots, useViewerId } from '../../drive';
import { driveLabelsOf, type SourceLabels } from './model';

export function useDriveLabels(): SourceLabels {
  const roots = useDriveRoots();
  const profiles = useProfiles();
  const viewerId = useViewerId();
  return driveLabelsOf({ roots, profiles, viewerId });
}
