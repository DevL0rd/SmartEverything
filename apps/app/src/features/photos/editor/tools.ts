import type { IconName } from '../../../components/icon';

export const EDITOR_TOOLS = ['crop', 'adjust', 'filters', 'eraser'] as const;

export type EditorTool = (typeof EDITOR_TOOLS)[number];

export const TOOL_LOOK: Readonly<
  Record<EditorTool, { readonly label: string; readonly icon: IconName }>
> = {
  crop: { label: 'Crop', icon: 'resize' },
  adjust: { label: 'Adjust', icon: 'sun' },
  filters: { label: 'Filters', icon: 'palette' },
  eraser: { label: 'Eraser', icon: 'eraser' },
};
