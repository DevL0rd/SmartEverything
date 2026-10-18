import { useSegments } from 'expo-router';
import { isNative } from '../design/platform';

export const SEARCH_PRESENTATION = isNative() ? 'fullScreenModal' : 'card';

export const FLOWS_PRESENTATION = isNative() ? 'modal' : 'transparentModal';

const ROOT_PRESENTATIONS: Readonly<Record<string, string>> = {
  search: SEARCH_PRESENTATION,
  '(flows)': FLOWS_PRESENTATION,
};

const SEE_THROUGH: readonly string[] = ['transparentModal', 'containedTransparentModal'];

const APP_ROUTE = '(app)';

export function useAppCovered(): boolean {
  const segments: readonly string[] = useSegments();
  const top = segments[0];
  if (top === undefined || top === APP_ROUTE) {
    return false;
  }
  const presentation = ROOT_PRESENTATIONS[top];
  return presentation === undefined || !SEE_THROUGH.includes(presentation);
}
