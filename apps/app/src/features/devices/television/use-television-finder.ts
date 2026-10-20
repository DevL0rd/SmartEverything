import { useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { useScreenPaused } from '../../../design/screen-pause';
import { useProviderLink, useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { stageOf } from '../../connections';
import { directAddressOf } from './direct-link';
import { findLine, mayFind, NEVER_TRIED, type FindMemory, type FindReply } from './find-guard';

const log = new Logger('app.devices');

export function useTelevisionFinder(device: Device): string | null {
  const linked = directAddressOf(useRow('television_settings', device.id)) !== null;
  const stage = stageOf(useProviderLink('samsung_tv'), null);
  const paused = useScreenPaused();
  const memory = useRef<FindMemory>(NEVER_TRIED);
  const [running, setRunning] = useState(false);
  const [reply, setReply] = useState<FindReply | null>(null);
  const [tried, setTried] = useState(false);
  const failed = stage.kind === 'failed';
  const asked = reply?.outcome === 'asking';

  useEffect(() => {
    if (asked && failed) {
      memory.current = { attempted: true, failedAt: Date.now() };
    }
  }, [asked, failed]);

  useEffect(() => {
    if (paused || !mayFind({ linked, running, memory: memory.current, now: Date.now() })) {
      return;
    }
    memory.current = { attempted: true, failedAt: null };
    setRunning(true);
    setTried(true);
    api()
      .call(E.findTelevision, { params: { deviceId: device.id } })
      .then((found) => {
        setReply(found);
        if (found.outcome === 'not_found') {
          memory.current = { attempted: true, failedAt: Date.now() };
        }
      })
      .catch((cause: unknown) => {
        memory.current = { attempted: true, failedAt: Date.now() };
        log.error('television.find_failed', cause, { deviceId: device.id });
      })
      .finally(() => {
        setRunning(false);
      });
  }, [device.id, device.online, linked, paused, running, failed]);

  return findLine({ linked, running, reply, stage, tried });
}
