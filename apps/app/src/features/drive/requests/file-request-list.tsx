import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveFileRequest } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { Disclosure } from '../../../components/disclosure';
import { href } from '../../../app-shell/hrefs';
import { FileGlyph } from '../../../components/files/file-glyph';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { relative } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSyncStatus } from '../../../store/selectors';
import { KIND_ICON } from '../../files/browser/node-glyph';
import { kindOfFile } from '../../files/source/node';
import {
  flattenPages,
  useDriveFileRequestRows,
  useDriveFileRequestUploads,
  useFileRequestClose,
  useViewerId,
} from '../data';
import {
  closeQuestionOf,
  fileRequestGroupsOf,
  receivedLineOf,
  REQUESTS_LINK_LINE,
  requestStateOf,
  stateLineOf,
} from './file-request-model';

export type EditFileRequest = (request: DriveFileRequest) => void;

function Uploads({ request }: { readonly request: DriveFileRequest }): ReactNode {
  const now = useMinute();
  const pages = useDriveFileRequestUploads(request.id);
  if (pages.data === undefined) {
    return pages.isError ? (
      <Text variant="footnote" tone="critical">
        The list of received files could not be read.
      </Text>
    ) : (
      <Skeleton shape="block" className="h-row-h" />
    );
  }
  const uploads = flattenPages(pages.data, (page) => page.items);
  return (
    <View role="list" aria-label={`Files sent to ${request.title}`}>
      {uploads.map((upload) => (
        <ListRow
          key={upload.itemId}
          title={upload.name}
          leading={
            <Icon name={KIND_ICON[kindOfFile(null, upload.name)]} size={20} tone="variant" />
          }
          href={href.driveOpen(upload.itemId)}
          subtitle={joinParts([
            `from ${upload.uploaderName}`,
            bytes(upload.bytes),
            relative(upload.uploadedAt, now),
          ])}
          compact
        />
      ))}
      {pages.hasNextPage ? (
        <Button
          label="Show more"
          variant="text"
          loading={pages.isFetchingNextPage}
          onPress={() => {
            background(pages.fetchNextPage(), 'drive.file_request_uploads.page_failed');
          }}
        />
      ) : null}
    </View>
  );
}

function Received({ request }: { readonly request: DriveFileRequest }): ReactNode {
  const [open, setOpen] = useState(false);
  if (request.uploads === 0) return null;
  return (
    <Disclosure
      label="Received files"
      count={request.uploads}
      open={open}
      onToggle={() => {
        setOpen((shown) => !shown);
      }}
    >
      <Uploads request={request} />
    </Disclosure>
  );
}

function CardHead({
  request,
  now,
}: {
  readonly request: DriveFileRequest;
  readonly now: number;
}): ReactNode {
  return (
    <>
      <View className="flex-row items-center gap-3">
        <FileGlyph kind="folder" name={request.folderName} well="m" />
        <View className="min-w-0 flex-1">
          <Text variant="body-strong" numberOfLines={1}>
            {request.title}
          </Text>
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {joinParts([`Into ${request.folderName}`, stateLineOf(request, now)])}
          </Text>
        </View>
      </View>
      {request.message === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={3}>
          {request.message}
        </Text>
      )}
    </>
  );
}

function CardActions({
  request,
  onEdit,
}: {
  readonly request: DriveFileRequest;
  readonly onEdit: EditFileRequest;
}): ReactNode {
  const live = useSyncStatus().status === 'live';
  const close = useFileRequestClose();
  return (
    <>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          label="Change"
          spoken={`Change ${request.title}`}
          icon="pencil"
          variant="tonal"
          disabled={!live}
          onPress={() => {
            onEdit(request);
          }}
        />
        <View className="flex-1" />
        <Button
          label="Close request"
          spoken={`Close ${request.title}`}
          variant="destructive"
          loading={close.busy}
          disabled={!live}
          onPress={() => {
            background(
              confirm(closeQuestionOf(request.title)).then((accepted) => {
                if (accepted) close.run(request.id);
              }),
              'drive.file_request.close_failed',
            );
          }}
        />
      </View>
      {close.problem === null ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {close.problem}
        </Text>
      )}
    </>
  );
}

function RequestCard({
  request,
  onEdit,
}: {
  readonly request: DriveFileRequest;
  readonly onEdit: EditFileRequest;
}): ReactNode {
  const now = useMinute();
  const open = requestStateOf(request, now) === 'open';
  return (
    <View className="mb-3 gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-card-pad">
      <CardHead request={request} now={now} />
      <Text variant="callout" className="tabular">
        {receivedLineOf(request)}
      </Text>
      <Received request={request} />
      {open ? <CardActions request={request} onEdit={onEdit} /> : null}
    </View>
  );
}

function Ended({
  requests,
  onEdit,
}: {
  readonly requests: readonly DriveFileRequest[];
  readonly onEdit: EditFileRequest;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (requests.length === 0) return null;
  return (
    <Disclosure
      label="Closed and ended requests"
      count={requests.length}
      open={open}
      onToggle={() => {
        setOpen((shown) => !shown);
      }}
    >
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} onEdit={onEdit} />
      ))}
    </Disclosure>
  );
}

export function useMyFileRequests(): readonly DriveFileRequest[] {
  const rows = useDriveFileRequestRows();
  const viewerId = useViewerId();
  return rows.filter((row) => row.createdBy === viewerId);
}

export function FileRequestsSection({ onEdit }: { readonly onEdit: EditFileRequest }): ReactNode {
  const now = useMinute();
  const rows = useDriveFileRequestRows();
  const groups = fileRequestGroupsOf(rows, useViewerId(), now);
  if (groups.open.length === 0 && groups.ended.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="title-3" accessibilityRole="header">
        File requests
      </Text>
      <Text variant="footnote" tone="variant">
        {REQUESTS_LINK_LINE}
      </Text>
      {groups.open.map((request) => (
        <RequestCard key={request.id} request={request} onEdit={onEdit} />
      ))}
      <Ended requests={groups.ended} onEdit={onEdit} />
    </View>
  );
}
