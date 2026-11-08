import ArchiveGlyph from 'lucide-react-native/icons/archive';
import ArchiveRestoreGlyph from 'lucide-react-native/icons/archive-restore';
import ArrowDownGlyph from 'lucide-react-native/icons/arrow-down';
import ArrowUpGlyph from 'lucide-react-native/icons/arrow-up';
import AtSignGlyph from 'lucide-react-native/icons/at-sign';
import CheckCheckGlyph from 'lucide-react-native/icons/check-check';
import GitBranchGlyph from 'lucide-react-native/icons/git-branch';
import PanelRightGlyph from 'lucide-react-native/icons/panel-right';
import PinGlyph from 'lucide-react-native/icons/pin';
import PinOffGlyph from 'lucide-react-native/icons/pin-off';
import ReplyGlyph from 'lucide-react-native/icons/reply';
import TextCursorGlyph from 'lucide-react-native/icons/text-cursor';
import TextWrapGlyph from 'lucide-react-native/icons/text-wrap';
import WifiOffGlyph from 'lucide-react-native/icons/wifi-off';

export const CHAT_GLYPHS = {
  pin: PinGlyph,
  pinOff: PinOffGlyph,
  archive: ArchiveGlyph,
  archiveRestore: ArchiveRestoreGlyph,
  reply: ReplyGlyph,
  gitBranch: GitBranchGlyph,
  arrowDown: ArrowDownGlyph,
  arrowUp: ArrowUpGlyph,
  atSign: AtSignGlyph,
  checkCheck: CheckCheckGlyph,
  textCursor: TextCursorGlyph,
  textWrap: TextWrapGlyph,
  panelRight: PanelRightGlyph,
  wifiOff: WifiOffGlyph,
} as const;
