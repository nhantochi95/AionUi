import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Close } from '@icon-park/react';
import classNames from 'classnames';
import { GitDiffViewer } from './GitDiffViewer';
import { TwoLaneProfiler } from './TwoLaneProfiler';
import type { ISharedRoomTask } from '@/common/types/sharedRoom';

export type PreviewSubtab = 'diff' | 'profiler' | 'preview';

export interface HoistedPreviewPanelProps {
  open: boolean;
  onClose: () => void;
  selectedTaskId?: string;
  task?: ISharedRoomTask | null;
  worktreeLeaseId?: string;
  roomName?: string;
  goalAncestry?: string[];
  onMergeSuccess?: () => void;
}

export const HoistedPreviewPanel: React.FC<HoistedPreviewPanelProps> = ({
  open,
  onClose,
  selectedTaskId,
  task,
  worktreeLeaseId,
  roomName = 'auth-fix',
  goalAncestry = ['Release v2.4', 'Auth Fix', 'Refresh Token'],
  onMergeSuccess,
}) => {
  const { t } = useTranslation();
  const [activeSubtab, setActiveSubtab] = useState<PreviewSubtab>('diff');

  if (!open) return null;

  return (
    <div
      data-testid='hoisted-preview-panel'
      className='w-380px shrink-0 border-s border-solid border-arco-2 bg-bg-1 flex flex-col h-full box-border relative z-10'
      style={{ width: '380px', minWidth: '380px', maxWidth: '380px' }}
    >
      {/* Top Header Row with Close & Subtabs */}
      <div className='p-12px border-b border-solid border-arco-2 flex items-center justify-between gap-8px bg-fill-1'>
        {/* Segmented 3 Subtabs */}
        <div className='inline-flex bg-fill-2 p-2px rd-8px border border-solid border-arco-2 gap-2px'>
          <button
            type='button'
            data-testid='subtab-diff'
            onClick={() => setActiveSubtab('diff')}
            className={classNames(
              'px-10px py-4px rd-6px text-11px font-600 transition-all border-0 cursor-pointer',
              activeSubtab === 'diff'
                ? 'bg-bg-1 text-primary-6 shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            {t('team.sharedRoom.preview.tabDiff', '🔀 Git Diff')}
          </button>
          <button
            type='button'
            data-testid='subtab-profiler'
            onClick={() => setActiveSubtab('profiler')}
            className={classNames(
              'px-10px py-4px rd-6px text-11px font-600 transition-all border-0 cursor-pointer',
              activeSubtab === 'profiler'
                ? 'bg-bg-1 text-primary-6 shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            {t('team.sharedRoom.preview.tabProfiler', '⏱️ Profiler')}
          </button>
          <button
            type='button'
            data-testid='subtab-preview'
            onClick={() => setActiveSubtab('preview')}
            className={classNames(
              'px-10px py-4px rd-6px text-11px font-600 transition-all border-0 cursor-pointer',
              activeSubtab === 'preview'
                ? 'bg-bg-1 text-primary-6 shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            {t('team.sharedRoom.preview.tabArtifacts', '👁️ Preview')}
          </button>
        </div>

        <button
          type='button'
          aria-label='Close preview panel'
          onClick={onClose}
          className='border-0 bg-transparent text-t-tertiary hover:text-t-primary cursor-pointer p-4px rd-4px'
        >
          <Close size='14' />
        </button>
      </div>

      {/* Goal Ancestry Breadcrumbs */}
      <div
        data-testid='goal-ancestry-box'
        className='px-12px py-8px bg-fill-2/60 border-b border-solid border-arco-2 flex flex-col gap-2px select-none'
      >
        <div className='text-10px font-bold text-t-tertiary uppercase tracking-wider'>
          {t('team.sharedRoom.preview.goalAncestry', '🎯 GOAL ANCESTRY')}
        </div>
        <div className='flex items-center gap-4px text-11px font-medium text-t-primary flex-wrap'>
          {goalAncestry.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className='text-t-tertiary font-mono'>›</span>}
              <span className={classNames(idx === goalAncestry.length - 1 && 'text-[rgb(var(--primary-6))] font-bold')}>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Panel Subtab Content */}
      <div className='flex-1 min-h-0 overflow-y-auto flex flex-col'>
        {activeSubtab === 'diff' && (
          <GitDiffViewer
            worktreeLeaseId={worktreeLeaseId}
            branchName={task?.title ? `wt/${roomName}` : 'wt/auth-fix'}
            baseBranch='main'
            onMergeSuccess={onMergeSuccess}
          />
        )}

        {activeSubtab === 'profiler' && (
          <TwoLaneProfiler
            modelTimeSec={26.0}
            toolTimeSec={22.2}
            totalTimeSec={48.2}
            showWalletCards={true}
          />
        )}

        {activeSubtab === 'preview' && (
          <div className='p-16px flex flex-col gap-12px text-12px'>
            <div className='font-bold text-t-primary'>
              {task?.title || `Task #${selectedTaskId || 'preview'}`}
            </div>
            {task?.description && (
              <div className='text-t-secondary leading-normal bg-fill-2 p-10px rd-8px'>
                {task.description}
              </div>
            )}
            {task?.artifacts && task.artifacts.length > 0 ? (
              <div className='flex flex-col gap-6px'>
                <span className='font-medium text-t-primary'>Artifacts:</span>
                {task.artifacts.map((art, idx) => (
                  <div key={idx} className='p-8px rd-6px bg-fill-2 text-11px font-mono'>
                    📄 {art.file_name}
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-t-tertiary text-11px italic'>
                No attached deliverables yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
