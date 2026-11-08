import CloudOffGlyph from 'lucide-react-native/icons/cloud-off';
import ExternalLinkGlyph from 'lucide-react-native/icons/external-link';
import LinkGlyph from 'lucide-react-native/icons/link';
import Link2Glyph from 'lucide-react-native/icons/link-2';
import Link2OffGlyph from 'lucide-react-native/icons/link-2-off';
import PointerGlyph from 'lucide-react-native/icons/pointer';

export const LINK_GLYPHS = {
  cloudOff: CloudOffGlyph,
  integrations: Link2Glyph,
  externalLink: ExternalLinkGlyph,
  link: LinkGlyph,
  unlink: Link2OffGlyph,
  pressButton: PointerGlyph,
} as const;
