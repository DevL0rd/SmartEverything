import { registerGlobals } from 'react-native-webrtc';
import { BackHandler, StatusBar } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';
import * as WebBrowser from 'expo-web-browser';
import { createPeer } from './camera-peer';
import {
  PeerError,
  type CameraPeer,
  type CaptureMode,
  type FrameCapture,
  type MediaHandle,
  type MediaLink,
  type PeerOptions,
  type ScreenFill,
} from './peer-types';

registerGlobals();

export function createCameraPeer(options: PeerOptions): CameraPeer {
  return createPeer(options, (event) => event.streams[0] ?? null);
}

export function capturesVideoFrames(): boolean {
  return false;
}

export function captureFrame(
  _media: MediaHandle,
  _name: string,
  _mode: CaptureMode,
): Promise<FrameCapture> {
  return Promise.reject(
    new PeerError('taking a snapshot', 'Android takes snapshots from the server, not the video'),
  );
}

export async function saveServerPicture(
  url: string,
  name: string,
  _mode: CaptureMode,
): Promise<FrameCapture> {
  await WebBrowser.openBrowserAsync(url);
  return { kind: 'opened', name };
}

export function relaySupported(): boolean {
  return false;
}

export function createRelayLink(_url: string): MediaLink {
  throw new PeerError('playing the relayed stream', 'Android has no Media Source Extensions');
}

export function canSharePictures(): boolean {
  return false;
}

export function immerse(on: boolean): Promise<void> {
  StatusBar.setHidden(on, 'fade');
  NavigationBar.setHidden(on);
  return Promise.resolve();
}

export async function fillScreen(fill: boolean): Promise<ScreenFill> {
  await immerse(fill);
  return { kind: 'filled' };
}

export function onScreenFillEnded(listener: () => void): () => void {
  const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
    listener();
    return true;
  });
  return (): void => {
    subscription.remove();
  };
}

export function pictureInPictureSupported(): boolean {
  return false;
}

export function enterPictureInPicture(_media: MediaHandle | null): void {
  throw new PeerError('opening picture in picture', 'Android shows the camera in the app only');
}
