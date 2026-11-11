import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@arco-design/web-react';
import { Aiming, BranchOne, CheckOne, Close, DashboardOne, FolderOpen, PreviewOpen } from '@icon-park/react';
import classNames from 'classnames';
import * as ipcBridgeNs from '@/common/adapter/ipcBridge';
import { GitDiffViewer } from './GitDiffViewer';
import { TwoLaneProfiler } from './TwoLaneProfiler';
import type { ISharedRoomTask, IStagedRoomArtifact } from '@/common/types/sharedRoom';

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
  teamId?: string;
  roomTeams?: Array<{ team_id: string; team_name: string }>;
  activeSubtabOverride?: PreviewSubtab;
  onSubtabChange?: (tab: PreviewSubtab) => void;
  previewArtifact?: IStagedRoomArtifact | null;
  onSelectArtifact?: (artifact: IStagedRoomArtifact | null) => void;
  onApproveTaskDone?: (taskId: string) => void;
  modelTimeSec?: number;
  toolTimeSec?: number;
  totalTimeSec?: number;
}

function formatArtifactBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const HoistedPreviewPanel: React.FC<HoistedPreviewPanelProps> = ({
  open,
  onClose,
  selectedTaskId,
  task,
  worktreeLeaseId,
  roomName,
  goalAncestry,
  onMergeSuccess,
  teamId,
  roomTeams,
  activeSubtabOverride,
  onSubtabChange,
  previewArtifact,
  onSelectArtifact,
  onApproveTaskDone,
  modelTimeSec = 0,
  toolTimeSec = 0,
  totalTimeSec = 0,
}) => {
  const { t } = useTranslation();
  const resolvedDefaultSubtab: PreviewSubtab = worktreeLeaseId
    ? 'diff'
    : task || previewArtifact
      ? 'preview'
      : 'profiler';
  const [internalSubtab, setInternalSubtab] = useState<PreviewSubtab>(
    activeSubtabOverride ?? resolvedDefaultSubtab
  );
  const [localArtifact, setLocalArtifact] = useState<IStagedRoomArtifact | null>(null);

  useEffect(() => {
    if (activeSubtabOverride) {
      setInternalSubtab(activeSubtabOverride);
    }
  }, [activeSubtabOverride]);

  useEffect(() => {
    if (!activeSubtabOverride) {
      setInternalSubtab(
        worktreeLeaseId ? 'diff' : task || previewArtifact ? 'preview' : 'profiler'
      );
    }
  }, [activeSubtabOverride, previewArtifact, selectedTaskId, task, worktreeLeaseId]);

  const activeSubtab = activeSubtabOverride ?? internalSubtab;
  const setSubtab = (next: PreviewSubtab) => {
    setInternalSubtab(next);
    onSubtabChange?.(next);
  };

  const activeArtifact = previewArtifact !== undefined ? previewArtifact : localArtifact;
  const selectArtifact = (art: IStagedRoomArtifact | null) => {
    setLocalArtifact(art);
    onSelectArtifact?.(art);
  };

  const effectiveGoalAncestry = useMemo(() => {
    if (goalAncestry && goalAncestry.length > 0) return goalAncestry;
    return [
      roomName,
      task ? `#${task.id.slice(0, 8)}` : t('team.sharedRoom.mainStream', 'Main Stream'),
    ].filter(Boolean);
  }, [goalAncestry, roomName, t, task]);

  const isTaskInReview =
    task?.status === 'in_review' || task?.status === 'review' || task?.status === 'qa';

  if (!open) return null;

  const openExternal = (stagedPath: string) => {
    if ('shell' in ipcBridgeNs && ipcBridgeNs.shell?.openFile?.invoke) {
      void ipcBridgeNs.shell.openFile.invoke(stagedPath);
    }
  };

  const showInFolder = (stagedPath: string) => {
    if ('shell' in ipcBridgeNs && ipcBridgeNs.shell?.showItemInFolder?.invoke) {
      void ipcBridgeNs.shell.showItemInFolder.invoke(stagedPath);
    }
  };

  return (
    <div
      data-testid='hoisted-preview-panel'
      className='w-380px shrink-0 border-s border-solid border-arco-2 bg-bg-1 flex flex-col h-full box-border relative z-10'
      style={{ width: '380px', minWidth: '380px', maxWidth: '380px' }}
    >
      {/* Top Header Row with Close & Subtabs */}
      <div className='p-12px border-b border-solid border-b-base flex items-center justify-between gap-8px bg-1'>
        {/* Segmented 3 Subtabs */}
        <div className='inline-flex bg-2 p-3px rounded-8px border border-solid border-b-base gap-2px'>
          <button
            type='button'
            data-testid='subtab-diff'
            onClick={() => setSubtab('diff')}
            className={classNames(
              'px-10px py-4px rounded-6px text-11px font-600 transition-all border-0 outline-none cursor-pointer whitespace-nowrap inline-flex items-center gap-4px',
              activeSubtab === 'diff'
                ? 'bg-1 text-[rgb(var(--primary-6))] shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            <BranchOne theme='outline' size='12' fill='currentColor' className='shrink-0' />
            <span>{t('team.sharedRoom.preview.tabDiff', 'Git Diff')}</span>
          </button>
          <button
            type='button'
            data-testid='subtab-profiler'
            onClick={() => setSubtab('profiler')}
            className={classNames(
              'px-10px py-4px rounded-6px text-11px font-600 transition-all border-0 outline-none cursor-pointer whitespace-nowrap inline-flex items-center gap-4px',
              activeSubtab === 'profiler'
                ? 'bg-1 text-[rgb(var(--primary-6))] shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            <DashboardOne theme='outline' size='12' fill='currentColor' className='shrink-0' />
            <span>{t('team.sharedRoom.preview.tabProfiler', 'Profiler')}</span>
          </button>
          <button
            type='button'
            data-testid='subtab-preview'
            onClick={() => setSubtab('preview')}
            className={classNames(
              'px-10px py-4px rounded-6px text-11px font-600 transition-all border-0 outline-none cursor-pointer whitespace-nowrap inline-flex items-center gap-4px',
              activeSubtab === 'preview'
                ? 'bg-1 text-[rgb(var(--primary-6))] shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            <PreviewOpen theme='outline' size='12' fill='currentColor' className='shrink-0' />
            <span>{t('team.sharedRoom.preview.tabArtifacts', 'Preview')}</span>
          </button>
        </div>

        <button
          type='button'
          aria-label={t('team.sharedRoom.preview.closePanel', 'Close preview panel')}
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
        <div className='text-10px font-bold text-t-tertiary uppercase tracking-wider inline-flex items-center gap-4px'>
          <Aiming theme='outline' size='11' fill='currentColor' className='shrink-0' />
          <span>{t('team.sharedRoom.preview.goalAncestry', 'GOAL ANCESTRY')}</span>
        </div>
        <div className='flex items-center gap-4px text-11px font-medium text-t-primary flex-wrap'>
          {effectiveGoalAncestry.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className='text-t-tertiary font-mono'>›</span>}
              <span className={classNames(idx === effectiveGoalAncestry.length - 1 && 'text-[rgb(var(--primary-6))] font-bold')}>
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Human-Only Approve Done Banner when task is in_review */}
      {task && isTaskInReview && onApproveTaskDone && (
        <div
          data-testid='preview-in-review-banner'
          className='px-12px py-8px bg-emerald-500/10 border-b border-solid border-emerald-500/30 flex items-center justify-between gap-8px'
        >
          <span className='text-11px font-600 text-emerald-700 dark:text-emerald-300 truncate'>
            {t('team.sharedRoom.preview.readyForHumanApproval', 'Ready for Human Review')}
          </span>
          <Button
            size='mini'
            type='primary'
            status='success'
            data-testid='preview-approve-done-btn'
            icon={<CheckOne size='12' />}
            onClick={() => onApproveTaskDone(task.id)}
          >
            {t('team.sharedRoom.kanban.approveDoneBtn', 'Approve Done')}
          </Button>
        </div>
      )}

      {/* Panel Subtab Content */}
      <div className='flex-1 min-h-0 overflow-y-auto flex flex-col'>
        {activeSubtab === 'diff' && (
          <GitDiffViewer
            worktreeLeaseId={worktreeLeaseId}
            branchName={`wt/${roomName}`}
            baseBranch='main'
            onMergeSuccess={onMergeSuccess}
          />
        )}

        {activeSubtab === 'profiler' && (
          <TwoLaneProfiler
            modelTimeSec={modelTimeSec}
            toolTimeSec={toolTimeSec}
            totalTimeSec={totalTimeSec}
            showWalletCards={true}
            teamId={teamId}
            roomTeams={roomTeams}
          />
        )}

        {activeSubtab === 'preview' && (
          <div className='p-16px flex flex-col gap-12px text-12px'>
            {activeArtifact && (
              <div
                data-testid='in-panel-artifact-preview'
                className='p-12px rd-8px bg-fill-2 border border-solid border-b-base flex flex-col gap-8px'
              >
                <div className='flex items-center justify-between gap-6px'>
                  <span className='font-600 text-t-primary truncate' title={activeArtifact.file_name}>
                    {activeArtifact.file_name}
                  </span>
                  <span className='text-10px text-t-tertiary font-mono shrink-0'>
                    {formatArtifactBytes(activeArtifact.size_bytes)}
                  </span>
                </div>
                {activeArtifact.is_image && activeArtifact.staged_path && (
                  <img
                    src={`file:///${activeArtifact.staged_path.replace(/\\/g, '/').replace(/^\/+/, '')}`}
                    alt={activeArtifact.file_name}
                    className='w-full max-h-200px object-contain rd-6px bg-1 border border-solid border-b-base'
                  />
                )}
                <div className='text-10px text-t-tertiary font-mono break-all'>
                  {activeArtifact.staged_path}
                </div>
                <div className='flex items-center gap-6px flex-wrap'>
                  <Button
                    size='mini'
                    type='primary'
                    data-testid='in-panel-artifact-open-external'
                    icon={<PreviewOpen size='12' />}
                    onClick={() => openExternal(activeArtifact.staged_path)}
                  >
                    {t('team.sharedRoom.artifactOpen', 'Open')}
                  </Button>
                  <Button
                    size='mini'
                    type='secondary'
                    data-testid='in-panel-artifact-show-folder'
                    icon={<FolderOpen size='12' />}
                    onClick={() => showInFolder(activeArtifact.staged_path)}
                  >
                    {t('team.sharedRoom.artifactFolder', 'Show in folder')}
                  </Button>
                </div>
              </div>
            )}

            <div className='font-bold text-t-primary'>
              {task?.title ||
                t('team.sharedRoom.preview.taskFallbackTitle', 'Task #{{id}}', {
                  id: selectedTaskId || 'preview',
                })}
            </div>
            {task?.description && (
              <div className='text-t-secondary leading-normal bg-fill-2 p-10px rd-8px'>
                {task.description}
              </div>
            )}
            {task?.result_summary && (
              <div className='text-t-primary leading-normal bg-emerald-500/8 border border-solid border-emerald-500/25 p-10px rd-8px text-11px'>
                {task.result_summary}
              </div>
            )}
            {task?.artifacts && task.artifacts.length > 0 ? (
              <div className='flex flex-col gap-6px'>
                <span className='font-medium text-t-primary'>
                  {t('team.sharedRoom.preview.artifactsHeading', 'Artifacts:')}
                </span>
                {task.artifacts.map((art, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectArtifact(art)}
                    className='p-8px rd-6px bg-fill-2 hover:bg-fill-3 text-11px font-mono cursor-pointer flex items-center justify-between gap-6px transition-colors'
                  >
                    <span className='truncate'>📄 {art.file_name}</span>
                    <span className='text-10px text-t-tertiary shrink-0'>
                      {formatArtifactBytes(art.size_bytes)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              !activeArtifact && (
                <div className='text-t-tertiary text-11px italic'>
                  {t('team.sharedRoom.preview.noDeliverables', 'No attached deliverables yet.')}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};
