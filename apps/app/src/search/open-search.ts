import type { RefObject } from 'react';
import type { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { href } from '../app-shell/hrefs';
import { measureAnchor, type Rect } from '../components/anchor';
import { idiomNow } from '../design/platform';
import { searchOverlay } from './overlay-state';

interface InlineField {
  readonly input: RefObject<TextInput | null>;
  readonly frame: RefObject<View | null>;
}

let inline: InlineField | null = null;
let sheet: ((query: string) => void) | null = null;

export function registerInlineSearch(field: InlineField): () => void {
  inline = field;
  return (): void => {
    if (inline === field) {
      inline = null;
    }
  };
}

export function registerSheetSearch(open: (query: string) => void): () => void {
  sheet = open;
  return (): void => {
    if (sheet === open) {
      sheet = null;
    }
  };
}

export function showInlineResults(query: string): void {
  if (inline === null) {
    return;
  }
  measureAnchor(inline.frame, (anchor) => {
    searchOverlay.set({ open: true, query, anchor, field: false });
  });
}

export function blurInlineSearch(): void {
  inline?.input.current?.blur();
}

export function openSearch(query = '', anchor: Rect | null = null): void {
  const input = inline?.input.current;
  if (input !== undefined && input !== null) {
    showInlineResults(query);
    input.focus();
    return;
  }
  if (idiomNow() === 'touch') {
    if (sheet !== null) {
      sheet(query);
      return;
    }
    router.push(href.search(query));
    return;
  }
  searchOverlay.set({ open: true, query, anchor, field: true });
}
