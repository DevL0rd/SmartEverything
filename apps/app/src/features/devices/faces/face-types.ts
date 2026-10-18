export type FaceName = 'chip' | 'row' | 'row-expanded' | 'tile' | 'card' | 'panel';

type FaceContext = 'standalone' | 'nested';

export interface FaceProps {
  readonly deviceId: string;
  readonly face: FaceName;
  readonly context: FaceContext;
  readonly onToggleExpand?: () => void;
}
