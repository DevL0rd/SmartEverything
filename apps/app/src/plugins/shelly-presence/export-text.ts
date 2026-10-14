import { Share } from 'react-native';
export async function exportPresenceText(name: string, content: string): Promise<void> {
  await Share.share({ title: name, message: content });
}
