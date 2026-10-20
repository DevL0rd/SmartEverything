import { loadAsync } from 'expo-font';
import GeistMedium from '../../../../../assets/fonts/Geist-Medium.ttf';
import GeistRegular from '../../../../../assets/fonts/Geist-Regular.ttf';
import GeistSemiBold from '../../../../../assets/fonts/Geist-SemiBold.ttf';

export function loadCanvasFonts(): Promise<void> {
  return loadAsync({
    'SeCanvasGeist-Regular': GeistRegular,
    'SeCanvasGeist-Medium': GeistMedium,
    'SeCanvasGeist-SemiBold': GeistSemiBold,
  });
}
