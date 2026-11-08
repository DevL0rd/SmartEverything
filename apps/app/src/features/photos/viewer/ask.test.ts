import { describe, expect, it, vi } from 'vitest';
import { addedByName } from './added-by';
import { askInChat } from './ask';

const chat = vi.hoisted(() => ({ attach: vi.fn(), push: vi.fn() }));

vi.mock('expo-router', () => ({ router: { push: chat.push } }));
vi.mock('../../assistant', () => ({
  attachFiles: chat.attach,
  useLastChat: (): { readonly kind: 'none' } => ({ kind: 'none' }),
}));

const CHAT = '00000000-0000-4000-8000-0000000000d1';
const ME = '00000000-0000-4000-8000-0000000000e1';
const ALEX = '00000000-0000-4000-8000-0000000000e2';

describe('viewer info people and chat', () => {
  it('names who added the photo, and says You for the viewer', () => {
    const people = [
      { id: ME, name: 'Sam' },
      { id: ALEX, name: 'Alex' },
    ];
    expect(addedByName(ALEX, people, ME)).toBe('Alex');
    expect(addedByName(ME, people, ME)).toBe('You');
    expect(addedByName(null, people, ME)).toBeNull();
    expect(addedByName('00000000-0000-4000-8000-0000000000e9', people, ME)).toBeNull();
  });

  it('attaches the photo to the open chat and opens that chat', () => {
    const file = {
      name: 'IMG_4821.HEIC',
      mime: 'image/heic',
      bytes: 10,
      preview: null,
      data: (): Promise<ArrayBuffer> => Promise.resolve(new ArrayBuffer(10)),
    };
    askInChat(CHAT, file);
    expect(chat.attach).toHaveBeenCalledWith([file], CHAT);
    expect(chat.push).toHaveBeenCalledWith({
      pathname: '/assistant/chat/[chatId]',
      params: { chatId: CHAT },
    });
  });
});
