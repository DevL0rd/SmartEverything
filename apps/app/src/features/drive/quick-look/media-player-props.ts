export interface MediaPlayerProps {
  readonly kind: 'video' | 'audio';
  readonly url: string;
  readonly poster: string | null;
  readonly label: string;
  readonly onOpen: () => void;
}
