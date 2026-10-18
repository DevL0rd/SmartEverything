import AppWindowGlyph from 'lucide-react-native/icons/app-window';
import FlashlightGlyph from 'lucide-react-native/icons/flashlight';
import HandGlyph from 'lucide-react-native/icons/hand';
import HeadphonesGlyph from 'lucide-react-native/icons/headphones';
import ScreenShareGlyph from 'lucide-react-native/icons/screen-share';
import SwitchCameraGlyph from 'lucide-react-native/icons/switch-camera';

export const CALL_GLYPHS = {
  screenShare: ScreenShareGlyph,
  switchCamera: SwitchCameraGlyph,
  hand: HandGlyph,
  headphones: HeadphonesGlyph,
  flashlight: FlashlightGlyph,
  appWindow: AppWindowGlyph,
} as const;
