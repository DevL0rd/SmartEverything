import type { LegacyAction } from '@smarteverything/domain';
import { duration } from '../../../format/time';
import { deviceName, personName, type Names } from './describe-names';
import { subjectLabel, subjectOf, subjectValue } from './present';

function commandPhrase(names: Names, action: Extract<LegacyAction, { type: 'command' }>): string {
  const subject = subjectOf(names.devices, action.deviceId, action.capability);
  const device = deviceName(names, action.deviceId);
  if (action.capability === 'power' && typeof action.value === 'boolean') {
    return `turn ${action.value ? 'on' : 'off'} ${device}`;
  }
  if (subject.capability?.value.kind === 'action') {
    return `${subjectLabel(subject)} on ${device}`;
  }
  return `set ${device} ${subjectLabel(subject)} to ${subjectValue(subject, action.value)}`;
}

function wakePhrase(names: Names, action: Extract<LegacyAction, { type: 'wake_ai' }>): string {
  const chat =
    action.chatId === null
      ? 'a new chat'
      : `“${names.chats.find((row) => row.id === action.chatId)?.title ?? 'a chat'}”`;
  return `wake ${personName(names, action.profileId)}’s AI in ${chat}`;
}

export function describeAction(names: Names, action: LegacyAction): string {
  switch (action.type) {
    case 'command':
      return commandPhrase(names, action);
    case 'scene':
      return `run ${names.scenes.find((scene) => scene.id === action.sceneId)?.name ?? 'a deleted scene'}`;
    case 'delay':
      return `wait ${duration(action.seconds)}`;
    case 'notify':
      return action.message.trim() === '' ? 'send a notice' : `send “${action.message.trim()}”`;
    case 'wake_ai':
      return wakePhrase(names, action);
    case 'tool':
      return `use the tool “${action.tool.replaceAll('_', ' ')}”`;
  }
}
