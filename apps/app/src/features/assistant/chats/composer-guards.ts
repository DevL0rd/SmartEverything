import { router } from 'expo-router';
import { Logger } from '@smarteverything/logging';
import type { AiChatRow, Engine } from '@smarteverything/domain';
import { selectProfile } from '../../../api/people';
import type { ProfileGateProps } from '../../../components/profile-gate';
import type { ReasonAction } from '../../../components/reason-line';
import { notify } from '../../../components/toast-store';
import { useActiveProfile } from '../../../store/people';
import { useRow } from '../../../store/selectors';
import { removeUpload } from '../data/uploads';
import type { ComposerProps } from '../components/composer';
import { engineSteersTurns } from '../model/composer-state';
import { machineSwitchOf } from '../model/harness-handoff';
import { unsupportedReason, useUnsupportedUploads } from '../provider/codex-attachments';

const log = new Logger('app.chat');

const CHOOSE_MODEL: ReasonAction = {
  label: 'Choose another model',
  onPress: (): void => {
    router.setParams({ operation: 'model' });
  },
};

const SWITCH_MACHINE: ReasonAction = {
  label: 'Switch machine',
  onPress: (): void => {
    router.setParams({ operation: 'device' });
  },
};

function engineFixes(engine: Engine): readonly ReasonAction[] {
  return engine.kind === 'dsh' ? [SWITCH_MACHINE] : [CHOOSE_MODEL];
}

function useProfileGate(chat: AiChatRow): ProfileGateProps | null {
  const active = useActiveProfile();
  const owner = useRow('profiles', chat.profile_id);
  if (active === null || owner === null || active.id === chat.profile_id) return null;
  return {
    profileName: owner.name,
    onSwitch: (): void => {
      log.info('profile.switch_requested', { chatId: chat.id, profileId: chat.profile_id });
      selectProfile(chat.profile_id).catch((error: unknown) => {
        log.error('profile.switch_failed', error, { chatId: chat.id, profileId: chat.profile_id });
        notify({ message: 'The profile was not changed', error, tone: 'critical' });
      });
    },
  };
}

function steersTurns(chat: AiChatRow): boolean {
  return (
    engineSteersTurns(chat.engine.kind) &&
    machineSwitchOf(chat.pending_execution_target).kind === 'idle'
  );
}

type Guards = Pick<
  ComposerProps,
  'attachmentReason' | 'unsupportedUploads' | 'fixes' | 'profileGate' | 'steerable'
>;

export function useComposerGuards(chat: AiChatRow, readOnly: boolean): Guards {
  const unsupported = useUnsupportedUploads(chat);
  const profileGate = useProfileGate(chat);
  return {
    attachmentReason: unsupportedReason(unsupported),
    unsupportedUploads: new Set(unsupported.map((upload) => upload.key)),
    fixes: {
      engine: readOnly ? [] : engineFixes(chat.engine),
      attachment: [
        {
          label: 'Remove unsupported',
          onPress: (): void => {
            log.info('composer.unsupported_removed', {
              chatId: chat.id,
              count: unsupported.length,
            });
            unsupported.forEach((upload) => {
              removeUpload(upload.key);
            });
          },
        },
        CHOOSE_MODEL,
      ],
    },
    profileGate,
    steerable: steersTurns(chat),
  };
}
