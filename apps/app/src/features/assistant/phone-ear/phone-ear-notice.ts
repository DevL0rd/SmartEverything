import { listeningLinked } from '../../../../modules/health-connect';
import { noticeHandler } from '../../../store/notice-registry';
import { phoneEar } from './phone-ear-live';

export const PHONE_EAR_NOTICE = noticeHandler(['listening_ear'], (notice) => {
  if (listeningLinked()) {
    phoneEar.receive(notice.message);
  }
});
