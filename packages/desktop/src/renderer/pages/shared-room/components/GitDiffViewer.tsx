import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Empty, Message, Spin, Tag } from '@arco-design/web-react';
import { CheckOne } from '@icon-park/react';
import useSWR from 'swr';
import Diff2Html from '@renderer/components/media/Diff2Html';
import { worktrees } from '@/common/adapter/ipcBridge';

export interface GitDiffViewerProps {
  worktreeLeaseId?: string;
  branchName?: string;
  baseBranch?: string;
  onMergeSuccess?: () => void;
}

export const GitDiffViewer: React.FC<GitDiffViewerProps> = ({
  worktreeLeaseId,
  branchName,
  baseBranch = 'main',
  onMergeSuccess,
}) => {
  const { t } = useTranslation();
  const [merging, setMerging] = useState(false);
  const [merged, setMerged] = useState(false);

  const { data, isLoading } = useSWR(
    worktreeLeaseId ? `/api/worktrees/${worktreeLeaseId}/diff` : null,
    () => worktrees.getDiff.invoke({ id: worktreeLeaseId! }),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const hasDiff = Boolean(worktreeLeaseId && data?.patch);
  const filesChanged = data?.files_changed ?? 0;
  const additions = data?.additions ?? 0;
  const deletions = data?.deletions ?? 0;
  const patch = data?.patch ?? '';
  const activeBranch = data?.branch_name || branchName || '';
  const activeBase = data?.base_branch || baseBranch;

  const handleMerge = async () => {
    if (!worktreeLeaseId || !hasDiff || merging || merged) return;
    setMerging(true);
    try {
      await worktrees.merge.invoke({ id: worktreeLeaseId });
      setMerged(true);
      Message.success(
        t('team.sharedRoom.preview.mergeSuccess', 'Branch successfully squash-merged into main')
      );
      onMergeSuccess?.();
    } catch (err: unknown) {
      Message.error(
        t('team.sharedRoom.preview.mergeFailed', 'Failed to merge worktree branch: {{error}}', {
          error: String((err as Error)?.message ?? err),
        })
      );
    } finally {
      setMerging(false);
    }
  };

  return (
    <div
      data-testid='git-diff-viewer'
      className='flex flex-col flex-1 h-full min-h-0 text-12px overflow-y-auto'
    >
      {/* Header Info (only when a worktree branch / diff exists) */}
      {(worktreeLeaseId || activeBranch) && (
        <div className='p-12px border-b border-solid border-arco-2 bg-fill-2 flex flex-col gap-8px'>
          <div className='flex items-center justify-between gap-6px flex-wrap'>
            <div className='flex items-center gap-4px font-mono text-11px'>
              <Tag color='blue' size='small'>
                {activeBranch || worktreeLeaseId}
              </Tag>
              <span className='text-t-tertiary'>→</span>
              <Tag color='gray' size='small'>
                {activeBase}
              </Tag>
            </div>
            <div className='flex items-center gap-6px text-11px'>
              <span className='text-t-secondary'>
                {t('team.actionInbox.filesChanged', '{{count}} files changed', { count: filesChanged })}
              </span>
              <span className='text-green-600 font-bold'>+{additions}</span>
              <span className='text-red-500 font-bold'>-{deletions}</span>
            </div>
          </div>

          <div className='p-8px rd-6px bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-11px text-green-800 dark:text-green-200 leading-normal'>
            {t(
              'team.sharedRoom.preview.isolationNotice',
              'Isolated Git Worktree: {{branch}}. Changes do not touch .git/index.lock of the main workspace.',
              { branch: activeBranch || worktreeLeaseId }
            )}
          </div>
        </div>
      )}

      {/* Diff Content */}
      <div className='flex-1 p-8px overflow-y-auto'>
        {isLoading ? (
          <div className='flex items-center justify-center p-24px'>
            <Spin dot />
          </div>
        ) : hasDiff ? (
          <Diff2Html diff={patch} title={`${activeBranch || worktreeLeaseId} (Unified Diff)`} />
        ) : (
          <div
            data-testid='git-diff-empty-state'
            className='flex items-center justify-center h-full min-h-160px p-16px text-center'
          >
            <Empty
              description={t(
                'team.sharedRoom.preview.noWorktreeDiff',
                'No active isolated Git worktree diff for this selection.'
              )}
            />
          </div>
        )}
      </div>

      {/* Footer Merge CTA Button */}
      <div className='p-12px border-t border-solid border-b-base bg-1 flex flex-col gap-6px'>
        <Button
          data-testid='squash-merge-btn'
          type='primary'
          status={merged ? 'success' : 'default'}
          disabled={merged || !worktreeLeaseId || !hasDiff}
          loading={merging}
          onClick={handleMerge}
          className='w-full !rounded-8px'
          icon={<CheckOne />}
        >
          {merged
            ? t('team.sharedRoom.preview.alreadyMerged', 'Branch already merged into main')
            : t('team.sharedRoom.preview.mergeBtn', 'Approve & Merge branch ({{branch}} → main)', {
                branch: activeBranch || activeBase,
              })}
        </Button>
      </div>
    </div>
  );
};
