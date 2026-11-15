import { describe, expect, it, vi } from 'vitest';
import type { KeyPress } from '../../../design/keyboard';
import { readRememberedTab, rememberTab } from '../details/tab-memory';
import { COMPUTER_FULL } from '../source/fixture-seeds';
import { nodeOfEntry, type FixtureEntry, type FixtureNode } from '../source/fixture-tree';
import type { FileNodeKind } from '../source/types';
import {
  contentFactsOf,
  contentOf,
  detailsOnInfo,
  isTextMime,
  isTextNode,
  kindLabelOf,
  placeOf,
  positionText,
  quickLookKeyFor,
  stepOf,
  type ContentFacts,
} from './quick-look-model';

function node(key: string, name: string, over: Partial<FixtureEntry> = {}): FixtureNode {
  return nodeOfEntry({ key, parentKey: 'root', name, ...over });
}

function press(key: string, change: Partial<KeyPress> = {}): KeyPress {
  return { key, command: false, alt: false, shift: false, typing: false, ...change };
}

const ALL_KINDS: readonly FileNodeKind[] = [
  'image',
  'video',
  'audio',
  'document',
  'archive',
  'link',
  'other',
];

function facts(over: Partial<ContentFacts> = {}): ContentFacts {
  return { kinds: ALL_KINDS, zipContents: true, thumb: false, ...over };
}

const ALPHA = node('alpha', 'Alpha', { kind: 'folder' });
const PHOTO = node('photo', 'IMG_2041.jpg', { mime: 'image/jpeg' });
const ZETA = node('zeta', 'Zeta', { kind: 'folder' });
const CLIP = node('clip', 'Fireworks.mp4', { mime: 'video/mp4' });
const NOTES = node('notes', 'notes.md', { mime: 'text/markdown' });
const NODES = [ALPHA, PHOTO, ZETA, CLIP, NOTES];

describe('quick look stepping', () => {
  it('steps between files and skips folders', () => {
    expect(stepOf(NODES, PHOTO, 'next')).toBe(CLIP);
    expect(stepOf(NODES, CLIP, 'previous')).toBe(PHOTO);
    expect(stepOf(NODES, CLIP, 'next')).toBe(NOTES);
  });

  it('stops at both ends of the list', () => {
    expect(stepOf(NODES, PHOTO, 'previous')).toBeNull();
    expect(stepOf(NODES, NOTES, 'next')).toBeNull();
  });

  it('steps from a folder to the files around it', () => {
    expect(stepOf(NODES, ZETA, 'previous')).toBe(PHOTO);
    expect(stepOf(NODES, ZETA, 'next')).toBe(CLIP);
    expect(stepOf(NODES, ALPHA, 'previous')).toBeNull();
  });

  it('counts the position among files only', () => {
    const place = placeOf(NODES, CLIP);
    expect(place.position).toBe(2);
    expect(place.total).toBe(3);
    expect(positionText(place)).toBe('2 of 3');
    expect(placeOf(NODES, ZETA).position).toBeNull();
  });

  it('shows no position for a single file or a node that left the list', () => {
    expect(positionText(placeOf([ALPHA, PHOTO], PHOTO))).toBeNull();
    const gone = placeOf([PHOTO, NOTES], CLIP);
    expect(gone).toEqual({ position: null, total: 2, previous: null, next: null });
    expect(stepOf([PHOTO, NOTES], CLIP, 'next')).toBeNull();
  });
});

describe('quick look keys', () => {
  it('maps the arrows and Space', () => {
    expect(quickLookKeyFor(press('ArrowLeft'))).toBe('previous');
    expect(quickLookKeyFor(press('ArrowRight'))).toBe('next');
    expect(quickLookKeyFor(press(' '))).toBe('close');
  });

  it('leaves the browser keys, chords and typing alone', () => {
    expect(quickLookKeyFor(press('ArrowDown'))).toBeNull();
    expect(quickLookKeyFor(press('Enter'))).toBeNull();
    expect(quickLookKeyFor(press('ArrowRight', { shift: true }))).toBeNull();
    expect(quickLookKeyFor(press('ArrowLeft', { command: true }))).toBeNull();
    expect(quickLookKeyFor(press('ArrowLeft', { alt: true }))).toBeNull();
    expect(quickLookKeyFor(press(' ', { typing: true }))).toBeNull();
  });
});

describe('quick look content per kind and mime', () => {
  it('picks the view for each kind of node', () => {
    expect(contentOf(ALPHA, facts())).toBe('folder');
    expect(contentOf(PHOTO, facts())).toBe('image');
    expect(contentOf(CLIP, facts())).toBe('video');
    expect(contentOf(node('song', 'song.flac', { mime: 'audio/flac' }), facts())).toBe('audio');
    expect(contentOf(NOTES, facts())).toBe('text');
    expect(contentOf(node('link', 'Latest', { kind: 'link' }), facts())).toBe('none');
    expect(contentOf(node('fifo', 'queue.txt', { kind: 'special' }), facts())).toBe('none');
  });

  it('shows images the app can draw even without a thumbnail', () => {
    expect(contentOf(node('a', 'new.png', { mime: 'image/png' }), facts())).toBe('image');
    expect(contentOf(node('b', 'new.webp'), facts())).toBe('image');
    const raw = node('c', 'DSC_0812.ARW', { mime: 'image/x-sony-arw' });
    expect(contentOf(raw, facts({ thumb: true }))).toBe('image');
    expect(contentOf(raw, facts())).toBe('none');
  });

  it('shows a document picture when the source has a thumbnail', () => {
    const pdf = node('pdf', 'Boiler.pdf', { mime: 'application/pdf' });
    expect(contentOf(pdf, facts({ thumb: true }))).toBe('picture');
    expect(contentOf(pdf, facts())).toBe('none');
  });

  it('opens a zip archive only where the source lists zip contents', () => {
    const zip = node('zip', 'Trip.zip', { mime: 'application/zip' });
    expect(zip.kind).toBe('archive');
    expect(contentOf(zip, facts())).toBe('zip');
    expect(contentOf(zip, facts({ zipContents: false }))).toBe('none');
    const named = node('zip2', 'Trip.zip', { kind: 'other', mime: 'application/octet-stream' });
    expect(contentOf(named, facts())).toBe('zip');
    expect(contentOf(node('7z', 'Trip.7z'), facts())).toBe('none');
  });

  it('shows nothing for a kind the source cannot quick look', () => {
    expect(contentOf(PHOTO, facts({ kinds: ['video'] }))).toBe('none');
    expect(contentOf(NOTES, contentFactsOf({ quickLook: [], zipContents: true }, null))).toBe(
      'none',
    );
    expect(contentOf(NOTES, contentFactsOf(COMPUTER_FULL, null))).toBe('text');
    expect(contentOf(node('o', 'data.bin'), contentFactsOf(COMPUTER_FULL, null))).toBe('none');
  });

  it('reads text from the mime type or, without one, from the name', () => {
    expect(isTextMime('text/plain; charset=utf-8')).toBe(true);
    expect(isTextMime('application/json')).toBe(true);
    expect(isTextMime('application/ld+json')).toBe(true);
    expect(isTextMime('image/svg+xml')).toBe(true);
    expect(isTextMime('application/pdf')).toBe(false);
    expect(isTextMime('application/octet-stream')).toBe(false);
    expect(isTextNode(node('log', 'build.log'))).toBe(true);
    expect(isTextNode(node('cfg', 'app.toml', { mime: 'application/octet-stream' }))).toBe(true);
    expect(isTextNode(node('bin', 'blob', { mime: 'application/octet-stream' }))).toBe(false);
    expect(isTextNode(node('dir', 'notes.md', { kind: 'folder' }))).toBe(false);
  });

  it('labels the kind from the file extension', () => {
    expect(kindLabelOf(node('p', 'Boiler service 2026.pdf'))).toBe('PDF');
    expect(kindLabelOf(node('r', 'README', { kind: 'other' }))).toBe('File');
    expect(kindLabelOf(node('t', 'README', { kind: 'document' }))).toBe('Document');
    expect(kindLabelOf(ALPHA)).toBe('Folder');
    expect(kindLabelOf(node('l', 'Latest.lnk', { kind: 'link' }))).toBe('Link');
    expect(kindLabelOf(node('s', 'queue.fifo', { kind: 'special' }))).toBe('Special file');
  });
});

describe('quick look details', () => {
  it('opens the details on Info for the shown node', () => {
    rememberTab('versions');
    const details = vi.fn<(shown: FixtureNode) => void>();
    detailsOnInfo(details, CLIP)?.();
    expect(readRememberedTab()).toBe('info');
    expect(details).toHaveBeenCalledWith(CLIP);
  });

  it('offers no Details when the host has no details', () => {
    expect(detailsOnInfo(null, CLIP)).toBeNull();
  });
});
