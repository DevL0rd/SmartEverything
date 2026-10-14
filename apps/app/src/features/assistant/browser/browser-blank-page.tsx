import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../../../components/text';
import { ListRow } from '../../../components/list-row';
import { browserCapability } from '../../../platform/browser-surface';
import { isHtmlPublication, type BrowserPublication } from './browser-selection';
export function BrowserBlankPage({ publications, available, onSelect }: { readonly publications: readonly BrowserPublication[]; readonly available: (publication: BrowserPublication) => boolean; readonly onSelect: (publication: BrowserPublication) => void }): ReactNode {
  return <ScrollView className="min-h-0 flex-1" contentContainerClassName="grow justify-center py-6">
    <View className="gap-2 px-6"><Text variant="title-3">Open a page</Text><Text tone="variant">Enter an address above, or ask the AI to show a page here.</Text>{browserCapability().limitation === null ? null : <Text variant="caption" tone="variant">{browserCapability().limitation}</Text>}</View>
    {publications.length === 0 ? null : <View className="mt-6"><Text variant="caption" tone="variant" className="px-6 py-2">Shared with this chat</Text>{publications.map((publication) => <ListRow key={publication.id} title={publication.title} icon={isHtmlPublication(publication) ? 'fileText' : 'globe'} subtitle={available(publication) ? isHtmlPublication(publication) ? 'HTML' : publication.source_origin : 'Preview connection unavailable. Reconnect to open this page.'} disabled={!available(publication)} onPress={() => { onSelect(publication); }} />)}</View>}
  </ScrollView>;
}
