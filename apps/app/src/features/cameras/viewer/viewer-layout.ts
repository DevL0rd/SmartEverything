export interface ViewerLayout {
  readonly wide: boolean;
  readonly columns: boolean;
}

export interface ViewerClasses {
  readonly row: string;
  readonly main: string;
  readonly side: string;
  readonly panels: string;
  readonly recent: string;
  readonly width: 'dashboard' | 'detail';
}

const GAP = 'gap-section-gap';

export function viewerClasses({ wide, columns }: ViewerLayout): ViewerClasses {
  const split = columns && !wide;
  return {
    row: wide ? `flex-row items-start ${GAP}` : GAP,
    main: wide ? `min-w-0 flex-1 ${GAP}` : GAP,
    side: wide ? `w-inspector ${GAP}` : split ? `flex-row items-start ${GAP}` : GAP,
    panels: split ? `min-w-0 flex-1 ${GAP}` : GAP,
    recent: split ? 'min-w-0 flex-1' : '',
    width: wide ? 'dashboard' : 'detail',
  };
}
