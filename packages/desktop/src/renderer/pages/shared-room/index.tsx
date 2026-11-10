/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Badge,
  Button,
  Empty,
  Input,
  Message,
  Modal,
  Popover,
  Select,
  Spin,
  Switch,
  Tag,
  Tooltip,
} from '@arco-design/web-react';
import { Communication, Delete, EditOne, Exchange, Inbox, Lightning, Peoples, Plus } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type {
  ISharedRoom,
  ISharedRoomMessage,
  ISharedRoomTask,
  IStagedRoomArtifact,
  SharedRoomTaskStatus,
} from '@/common/types/sharedRoom';
import type { ModelTargetSpec } from '@/common/types/team/teamHubTypes';
import SharedRoomFormModal from './SharedRoomFormModal';
import { useSharedRoomList } from './hooks/useSharedRoomList';
import { useCompositionInput } from '@renderer/hooks/chat/useCompositionInput';
import { HybridKanbanBoard } from './components/kanban/HybridKanbanBoard';
import type { KanbanColumnKey } from './components/kanban/kanbanTypes';
import { RoundedPillComposer } from './components/RoundedPillComposer';
import { HoistedPreviewPanel } from './components/HoistedPreviewPanel';
import { TwoLaneProfiler } from './components/TwoLaneProfiler';
import ConnectedModelPickerPopover, {
  type ModelPickerSelectionMeta,
} from '@/renderer/pages/team/components/modelHub/ConnectedModelPickerPopover';
import TeamContextCompactPopover from '@/renderer/pages/team/components/modelHub/TeamContextCompactPopover';
import { useTeamContextAndModels } from '@/renderer/pages/team/components/modelHub/useTeamContextAndModels';
import ReactMarkdown from 'react-markdown';
import CodeBlock from '@renderer/components/Markdown/CodeBlock';
import {
  MARKDOWN_REMARK_PLUGINS,
  MarkdownTable,
  MarkdownTd,
} from '@renderer/components/Markdown/markdownComponents';

const ROOM_MARKDOWN_COMPONENTS = {
  table: MarkdownTable as never,
  td: MarkdownTd as never,
  code: CodeBlock as never,
};

export type SharedRoomViewTab = 'chat' | 'kanban' | 'cost';

const TEAM_ACCENT_PALETTE = ['#165DFF', '#00B42A', '#722ED1', '#FF7D00', '#0FC6C2', '#EB0AA4', '#3491FA', '#F53F3F'];

function mentionSlug(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '_')
    .replace(/^[-_]+|[-_]+$/g, '')
    .toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShortTime(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const TelegramIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox='0 0 24 24' fill='none' aria-hidden='true'>
    <path
      d='M21.6 3.6L2.9 10.8C1.9 11.2 1.9 12.6 2.9 12.9L7.6 14.4L18.4 7.6C18.9 7.3 19.4 7.9 19 8.3L10.2 16.3L9.9 20.5C9.9 21.4 11 21.8 11.6 21.2L14.3 18.6L18.9 22C19.7 22.6 20.9 22.1 21.1 21.1L23.1 4.9C23.3 3.9 22.5 3.2 21.6 3.6Z'
      fill='currentColor'
    />
  </svg>
);

const ArtifactCard: React.FC<{ artifact: IStagedRoomArtifact }> = ({ artifact }) => {
  const { t } = useTranslation();
  return (
    <div className='inline-flex items-center gap-8px px-10px py-6px rd-8px bg-fill-2 border border-solid border-arco-2 text-12px max-w-full'>
      <span className='font-500 truncate max-w-200px' title={artifact.file_name}>
        {artifact.is_image ? '🖼️' : '📄'} {artifact.file_name}
      </span>
      <span className='text-11px text-t-tertiary shrink-0'>({formatBytes(artifact.size_bytes)})</span>
      <button
        type='button'
        className='text-11px text-primary-6 bg-transparent border-0 cursor-pointer hover:underline p-0 shrink-0'
        onClick={() => void ipcBridge.shell.openFile.invoke(artifact.staged_path)}
      >
        {t('team.sharedRoom.artifactOpen')}
      </button>
      <button
        type='button'
        className='text-11px text-t-secondary bg-transparent border-0 cursor-pointer hover:underline p-0 shrink-0'
        onClick={() => void ipcBridge.shell.showItemInFolder.invoke(artifact.staged_path)}
      >
        {t('team.sharedRoom.artifactFolder')}
      </button>
    </div>
  );
};

const SharedRoomPage: React.FC = () => {
  const { t } = useTranslation();
  const { id: roomId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mutate: refreshRoomList, removeRoom } = useSharedRoomList();

  const {
    data: room,
    isLoading: roomLoading,
    mutate: mutateRoom,
  } = useSWR<ISharedRoom | undefined>(
    roomId ? `shared-room/${roomId}` : null,
    () => ipcBridge.sharedRoom.get.invoke({ id: roomId! }),
    { revalidateOnFocus: false }
  );

  const {
    data: messagesData,
    isLoading: messagesLoading,
    mutate: mutateMessages,
  } = useSWR<ISharedRoomMessage[]>(
    roomId ? `shared-room/${roomId}/messages` : null,
    () => ipcBridge.sharedRoom.listMessages.invoke({ id: roomId!, limit: 200 }),
    { revalidateOnFocus: false }
  );

  const { data: tasksData, mutate: mutateTasks } = useSWR<ISharedRoomTask[]>(
    roomId ? `shared-room/${roomId}/tasks` : null,
    () => ipcBridge.sharedRoom.listTasks.invoke({ room_id: roomId! }),
    { revalidateOnFocus: false }
  );

  const messages = messagesData ?? [];
  const tasks = tasksData ?? [];

  const { compositionHandlers: composerComposition, createKeyDownHandler: createComposerKeyDown } = useCompositionInput();
  const [composerText, setComposerText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [replyToMsg, setReplyToMsg] = useState<ISharedRoomMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [allowingHops, setAllowingHops] = useState(false);

  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [viewTab, setViewTab] = useState<SharedRoomViewTab>('chat');
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedHubTeamId, setSelectedHubTeamId] = useState<string | undefined>();

  const defaultHubTeamId = useMemo(
    () => room?.members.find((m) => m.is_host)?.team_id ?? room?.members[0]?.team_id,
    [room?.members]
  );
  const activeHubTeamId =
    selectedHubTeamId && room?.members.some((m) => m.team_id === selectedHubTeamId)
      ? selectedHubTeamId
      : defaultHubTeamId;

  const {
    slots: hubSlots,
    autoCompactEnabled: hubAutoCompactEnabled,
    autoCompactThresholdPct: hubAutoCompactThresholdPct,
    maxUsagePercent: hubMaxUsagePercent,
    highestLevel: hubHighestLevel,
    compacting: hubCompacting,
    switchingModels: hubSwitchingModels,
    compactTeam: hubCompactTeam,
    toggleAutoCompact: hubToggleAutoCompact,
    switchModels: hubSwitchModels,
  } = useTeamContextAndModels(activeHubTeamId);

  // Telegram room binding popover state
  const [tgPopoverOpen, setTgPopoverOpen] = useState(false);
  const [tgChatId, setTgChatId] = useState('');
  const [tgThreadId, setTgThreadId] = useState('');
  const [tgSaving, setTgSaving] = useState(false);

  // Cross-team task creation modal state
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskFromTeamId, setTaskFromTeamId] = useState<string>('');
  const [taskToTeamId, setTaskToTeamId] = useState<string>('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskBlockedBy, setTaskBlockedBy] = useState<string[]>([]);
  const [taskFiles, setTaskFiles] = useState<string[]>([]);
  const [taskSaving, setTaskSaving] = useState(false);

  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setComposerText('');
    setAttachedFiles([]);
    setReplyToMsg(null);
    setTgPopoverOpen(false);
    setEditModalOpen(false);
    setTaskModalOpen(false);
    setSelectedHubTeamId(undefined);
  }, [roomId]);

  const handleRoomQuickCompact = useCallback(async () => {
    try {
      const res = await hubCompactTeam({ mode: 'auto' });
      const count = res?.outcomes?.length ?? 1;
      Message.success(t('team.modelHub.compactSuccess', 'Compacted context for {{count}} member(s)', { count }));
    } catch (err) {
      Message.error(
        t('team.modelHub.compactFailed', 'Failed to compact context: {{error}}', { error: String(err) })
      );
    }
  }, [hubCompactTeam, t]);

  const handleRoomSwitchModels = useCallback(
    async (target: ModelTargetSpec, meta: ModelPickerSelectionMeta) => {
      try {
        const res =
          meta.scope === 'slots' && meta.slotId
            ? await hubSwitchModels({
                scope: 'slots',
                updates: [{ slot_id: meta.slotId, target }],
                force_interrupt: meta.forceInterrupt,
              })
            : await hubSwitchModels({
                scope: meta.scope === 'teammates_only' ? 'teammates_only' : 'all',
                target,
                force_interrupt: meta.forceInterrupt,
              });
        const count = res?.outcomes?.length ?? 1;
        Message.success(
          t('team.modelHub.switchModelsSuccess', 'Updated models for {{count}} member(s)', { count })
        );
      } catch (err) {
        Message.error(
          t('team.modelHub.switchModelsFailed', 'Failed to switch models: {{error}}', { error: String(err) })
        );
      }
    },
    [hubSwitchModels, t]
  );

  useEffect(() => {
    if (!room) return;
    setTgChatId(room.telegram_chat_id ?? '');
    setTgThreadId(room.telegram_thread_id ?? '');
  }, [room]);

  useEffect(() => {
    if (!roomId) return;
    const unsubUpdated = ipcBridge.sharedRoom.updated.on((ev) => {
      if (ev.room.id === roomId) {
        void mutateRoom(ev.room, false);
      }
    });
    const unsubRemoved = ipcBridge.sharedRoom.removed.on((ev) => {
      if (ev.room_id === roomId) {
        void navigate('/guid');
      }
    });
    const unsubMsg = ipcBridge.sharedRoom.messageCreated.on((ev) => {
      if (ev.room_id === roomId) {
        void mutateMessages();
        if (ev.room) {
          void mutateRoom(ev.room, false);
        } else {
          void mutateRoom();
        }
      }
    });
    const unsubTask = ipcBridge.sharedRoom.taskChanged.on((ev) => {
      if (ev.room_id === roomId) {
        void mutateTasks();
      }
    });
    return () => {
      unsubUpdated();
      unsubRemoved();
      unsubMsg();
      unsubTask();
    };
  }, [mutateMessages, mutateRoom, mutateTasks, navigate, roomId]);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const teamColorMap = useMemo(() => {
    const map = new Map<string, string>();
    (room?.members ?? []).forEach((m, idx) => {
      map.set(m.team_id, TEAM_ACCENT_PALETTE[idx % TEAM_ACCENT_PALETTE.length]);
    });
    return map;
  }, [room?.members]);

  const messageById = useMemo(() => {
    const map = new Map<string, ISharedRoomMessage>();
    messages.forEach((m) => map.set(m.id, m));
    return map;
  }, [messages]);

  const taskById = useMemo(() => {
    const map = new Map<string, ISharedRoomTask>();
    tasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [tasks]);

  const allArtifacts = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ artifact: IStagedRoomArtifact; sourceLabel: string; createdAt: number }> = [];
    for (const msg of messages) {
      for (const art of msg.attachments ?? []) {
        if (!seen.has(art.staged_path)) {
          seen.add(art.staged_path);
          list.push({ artifact: art, sourceLabel: msg.sender_label, createdAt: msg.created_at });
        }
      }
    }
    for (const task of tasks) {
      for (const art of task.artifacts ?? []) {
        if (!seen.has(art.staged_path)) {
          seen.add(art.staged_path);
          list.push({
            artifact: art,
            sourceLabel: `Task: ${task.title}`,
            createdAt: task.updated_at,
          });
        }
      }
    }
    return list.toSorted((a, b) => b.createdAt - a.createdAt);
  }, [messages, tasks]);

  const insertMention = useCallback((handle: string) => {
    setComposerText((prev) => {
      const prefix = prev.length > 0 && !prev.endsWith(' ') && !prev.endsWith('\n') ? `${prev} ` : prev;
      return `${prefix}@${handle} `;
    });
    textareaRef.current?.focus();
  }, []);

  const handlePickFiles = useCallback(async () => {
    try {
      const picked = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile', 'multiSelections'],
      });
      if (picked && picked.length > 0) {
        setAttachedFiles((prev) => Array.from(new Set([...prev, ...picked])));
      }
    } catch (err) {
      Message.error(t('team.sharedRoom.filePickFailed', { error: String(err) }));
    }
  }, [t]);

  const handlePickTaskFiles = useCallback(async () => {
    try {
      const picked = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile', 'multiSelections'],
      });
      if (picked && picked.length > 0) {
        setTaskFiles((prev) => Array.from(new Set([...prev, ...picked])));
      }
    } catch (err) {
      Message.error(t('team.sharedRoom.taskFilePickFailed', { error: String(err) }));
    }
  }, [t]);

  const handleSendMessage = useCallback(async () => {
    if (!roomId || sending) return;
    const trimmed = composerText.trim();
    if (!trimmed && attachedFiles.length === 0) return;

    setSending(true);
    try {
      const res = await ipcBridge.sharedRoom.sendMessage.invoke({
        id: roomId,
        content: trimmed,
        files: attachedFiles,
        reply_to_id: replyToMsg?.id ?? null,
      });
      setComposerText('');
      setAttachedFiles([]);
      setReplyToMsg(null);
      await Promise.all([
        mutateMessages((prev) => {
          const list = prev ?? [];
          return list.some((m) => m.id === res.message.id) ? list : [...list, res.message];
        }, true),
        mutateRoom(),
      ]);
      if (res.routed_targets.length > 0) {
        const names = res.routed_targets
          .map((rt) => room?.members.find((m) => m.team_id === rt.team_id)?.team_name ?? rt.team_id)
          .join(', ');
        Message.success(t('team.sharedRoom.wokeLeaderSuccess', { names }));
      }
    } catch (err) {
      Message.error(t('team.sharedRoom.sendMessageFailed', { error: String(err) }));
    } finally {
      setSending(false);
    }
  }, [attachedFiles, composerText, mutateMessages, mutateRoom, replyToMsg, room?.members, roomId, sending, t]);

  const handleDeleteCurrentRoom = useCallback(() => {
    if (!room) return;
    Modal.confirm({
      title: t('team.sharedRoom.deleteConfirmTitle'),
      content: t('team.sharedRoom.deleteConfirmContent', { name: room.name }),
      okText: t('team.sharedRoom.deleteRoomOk'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger', 'data-testid': 'shared-room-confirm-delete-btn' } as Record<string, unknown>,
      onOk: async () => {
        try {
          await removeRoom(room.id);
          Message.success(t('team.sharedRoom.deleteSuccess', { name: room.name }));
          void navigate('/guid');
        } catch (err) {
          Message.error(t('team.sharedRoom.deleteFailed', { error: String(err) }));
        }
      },
    });
  }, [navigate, removeRoom, room, t]);

  const handleAllowMoreHops = useCallback(async () => {
    if (!roomId || allowingHops) return;
    setAllowingHops(true);
    try {
      const updated = await ipcBridge.sharedRoom.allowMoreHops.invoke({ id: roomId, grant_hops: 5 });
      await mutateRoom(updated, false);
      Message.success(t('team.sharedRoom.grantHopsSuccess'));
    } catch (err) {
      Message.error(t('team.sharedRoom.grantHopsFailed', { error: String(err) }));
    } finally {
      setAllowingHops(false);
    }
  }, [allowingHops, mutateRoom, roomId, t]);

  const handleKanbanStatusChange = useCallback(
    async (taskId: string, targetCol: KanbanColumnKey) => {
      if (!roomId) return;
      try {
        await ipcBridge.sharedRoom.updateTask.invoke({
          room_id: roomId,
          task_id: taskId,
          status: targetCol,
        });
        await mutateTasks();
        if (targetCol === 'done') {
          Message.success(
            t('team.sharedRoom.kanban.mergedNotice', 'Branch merged into main & marked as Done')
          );
        }
      } catch (err) {
        Message.error(String(err));
      }
    },
    [roomId, mutateTasks, t]
  );


  const handleToggleRoomDmTarget = useCallback(
    async (checked: boolean) => {
      if (!roomId) return;
      setTgSaving(true);
      try {
        const updated = await ipcBridge.sharedRoom.upsertTelegramBinding.invoke({
          id: roomId,
          set_active_dm_target: checked,
        });
        await mutateRoom(updated, false);
        Message.success(
          checked
            ? t('team.sharedRoom.telegramDmSetSuccess')
            : t('team.sharedRoom.telegramDmRemovedSuccess')
        );
      } catch (err) {
        Message.error(t('team.sharedRoom.telegramDmUpdateFailed', { error: String(err) }));
      } finally {
        setTgSaving(false);
      }
    },
    [mutateRoom, roomId, t]
  );

  const handleSaveRoomTelegramGroup = useCallback(async () => {
    if (!roomId) return;
    if (!tgChatId.trim()) {
      Message.warning(t('team.sharedRoom.telegramChatIdRequired'));
      return;
    }
    setTgSaving(true);
    try {
      const updated = await ipcBridge.sharedRoom.upsertTelegramBinding.invoke({
        id: roomId,
        group_chat_id: tgChatId.trim(),
        group_thread_id: tgThreadId.trim() ? tgThreadId.trim() : null,
      });
      await mutateRoom(updated, false);
      Message.success(t('team.sharedRoom.telegramBindingSuccess'));
    } catch (err) {
      Message.error(t('team.sharedRoom.telegramBindingFailed', { error: String(err) }));
    } finally {
      setTgSaving(false);
    }
  }, [mutateRoom, roomId, t, tgChatId, tgThreadId]);

  const handleClearRoomTelegramGroup = useCallback(async () => {
    if (!roomId) return;
    setTgSaving(true);
    try {
      const updated = await ipcBridge.sharedRoom.deleteTelegramBinding.invoke({ id: roomId });
      setTgChatId('');
      setTgThreadId('');
      await mutateRoom(updated, false);
      Message.success(t('team.sharedRoom.telegramUnbindingSuccess'));
    } catch (err) {
      Message.error(t('team.sharedRoom.telegramUnbindingFailed', { error: String(err) }));
    } finally {
      setTgSaving(false);
    }
  }, [mutateRoom, roomId, t]);

  const handleCreateTask = useCallback(async () => {
    if (!roomId) return;
    if (!taskToTeamId) {
      Message.warning(t('team.sharedRoom.taskToTeamRequired'));
      return;
    }
    if (!taskTitle.trim()) {
      Message.warning(t('team.sharedRoom.taskTitleRequired'));
      return;
    }
    setTaskSaving(true);
    try {
      await ipcBridge.sharedRoom.createTask.invoke({
        room_id: roomId,
        from_team_id: taskFromTeamId || null,
        to_team_id: taskToTeamId,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        blocked_by: taskBlockedBy,
        files: taskFiles,
      });
      setTaskModalOpen(false);
      setTaskTitle('');
      setTaskDescription('');
      setTaskBlockedBy([]);
      setTaskFiles([]);
      await mutateTasks();
      Message.success(t('team.sharedRoom.taskCreateSuccess'));
    } catch (err) {
      Message.error(t('team.sharedRoom.taskCreateFailed', { error: String(err) }));
    } finally {
      setTaskSaving(false);
    }
  }, [mutateTasks, roomId, t, taskBlockedBy, taskDescription, taskFiles, taskFromTeamId, taskTitle, taskToTeamId]);

  const handleUpdateTaskStatus = useCallback(
    async (task: ISharedRoomTask, nextStatus: SharedRoomTaskStatus) => {
      if (!roomId) return;
      try {
        await ipcBridge.sharedRoom.updateTask.invoke({
          room_id: roomId,
          task_id: task.id,
          status: nextStatus,
        });
        await mutateTasks();
        Message.success(
          nextStatus === 'completed'
            ? t('team.sharedRoom.taskStatusCompletedNotice')
            : t('team.sharedRoom.taskStatusUpdatedNotice')
        );
      } catch (err) {
        Message.error(t('team.sharedRoom.taskUpdateFailed', { error: String(err) }));
      }
    },
    [mutateTasks, roomId, t]
  );

  if (roomLoading && !room) {
    return (
      <div className='h-full w-full flex items-center justify-center'>
        <Spin size={28} />
      </div>
    );
  }

  if (!room) {
    return (
      <div className='h-full w-full flex flex-col items-center justify-center gap-12px text-t-secondary'>
        <Empty description={t('team.sharedRoom.roomNotFound')} />
        <Button type='outline' onClick={() => void navigate('/guid')}>
          {t('team.sharedRoom.backToHome')}
        </Button>
      </div>
    );
  }

  const isHopLimitReached = room.hop_count_since_human >= room.max_hops;
  const openTasksCount = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;

  const tgRoomPopoverContent = (
    <div className='w-full min-w-0 box-border flex flex-col gap-10px text-t-primary'>
      <div className='flex items-center justify-between gap-8px border-b border-arco-2 pb-8px min-w-0'>
        <span className='text-13px font-600 truncate min-w-0 flex-1'>{t('team.sharedRoom.telegramSyncTitle', { name: room.name })}</span>
        {room.is_active_dm_target && (
          <span className='shrink-0 inline-flex items-center'>
            <Tag size='small' color='arcoblue'>
              {t('team.sharedRoom.activeDmTag')}
            </Tag>
          </span>
        )}
      </div>

      <div className='flex items-center justify-between gap-12px w-full min-w-0'>
        <div className='flex flex-col gap-2px min-w-0 flex-1'>
          <span className='text-12px font-500'>{t('team.sharedRoom.setDmChannel')}</span>
          <span className='text-11px text-t-tertiary leading-15px break-words'>
            {t('team.sharedRoom.setDmChannelDesc')}
          </span>
        </div>
        <Switch
          size='small'
          className='shrink-0 aion-tg-switch'
          checked={room.is_active_dm_target}
          loading={tgSaving}
          onChange={(val) => void handleToggleRoomDmTarget(val)}
        />
      </div>

      <div className='border-t border-arco-2 pt-8px flex flex-col gap-6px w-full min-w-0'>
        <span className='text-12px font-500 text-t-secondary'>{t('team.sharedRoom.linkTelegramGroupTitle')}</span>
        <Input size='small' placeholder={t('team.sharedRoom.groupChatIdPlaceholder')} value={tgChatId} onChange={setTgChatId} />
        <Input
          size='small'
          placeholder={t('team.sharedRoom.topicThreadIdPlaceholder')}
          value={tgThreadId}
          onChange={setTgThreadId}
        />
        <div className='flex items-center justify-end gap-6px mt-2px'>
          {room.telegram_chat_id && (
            <Button size='mini' status='danger' disabled={tgSaving} onClick={() => void handleClearRoomTelegramGroup()}>
              {t('team.sharedRoom.unlinkGroupBtn')}
            </Button>
          )}
          <Button size='mini' type='primary' loading={tgSaving} onClick={() => void handleSaveRoomTelegramGroup()}>
            {t('team.sharedRoom.saveGroupBtn')}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className='h-full w-full flex flex-col overflow-hidden bg-bg-1 text-t-primary'>
      {/* Top Header */}
      <header className='shrink-0 border-b border-arco-2 px-16px py-10px flex flex-wrap items-center justify-between gap-10px bg-bg-1'>
        <div className='flex items-center gap-10px min-w-0 flex-1'>
          <span className='w-30px h-30px rd-8px bg-[#165DFF]/12 text-[#165DFF] inline-flex items-center justify-center shrink-0'>
            <Communication theme='outline' size='17' fill='currentColor' />
          </span>
          <div className='flex flex-col min-w-0'>
            <div className='flex items-center gap-8px min-w-0'>
              <span className='text-15px font-600 truncate'>#{room.name}</span>
              <span
                data-testid='room-header-worktree-chip'
                className='font-mono text-11px px-7px py-2px rd-full bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-solid border-green-200 dark:border-green-800'
              >
                🌿 wt/{room.name}
              </span>
              <Tooltip content={t('team.sharedRoom.hopsTooltip')}>
                <Tag size='small' color={isHopLimitReached ? 'orangered' : 'gray'}>
                  {t('team.sharedRoom.hopsTag', { current: room.hop_count_since_human, max: room.max_hops })}
                </Tag>
              </Tooltip>
            </div>
            {room.description && <span className='text-11px text-t-tertiary truncate'>{room.description}</span>}
          </div>
        </div>

        {/* Segmented 3-Tab Room Switcher (F17) */}
        <div
          data-testid='room-view-switcher'
          className='inline-flex bg-fill-2 p-3px rd-8px border border-solid border-arco-2 gap-2px select-none'
        >
          <button
            type='button'
            data-testid='room-tab-chat'
            onClick={() => setViewTab('chat')}
            className={classNames(
              'px-12px py-5px rd-6px text-12px font-600 transition-all border-0 cursor-pointer flex items-center gap-6px',
              viewTab === 'chat'
                ? 'bg-bg-1 text-primary-6 shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            <span>💬</span>
            <span>{t('team.sharedRoom.tabChat', 'Chat')}</span>
          </button>
          <button
            type='button'
            data-testid='room-tab-kanban'
            onClick={() => setViewTab('kanban')}
            className={classNames(
              'px-12px py-5px rd-6px text-12px font-600 transition-all border-0 cursor-pointer flex items-center gap-6px',
              viewTab === 'kanban'
                ? 'bg-bg-1 text-primary-6 shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            <span>📋</span>
            <span>{t('team.sharedRoom.tabKanban', 'Kanban ({{count}})', { count: tasks.length })}</span>
          </button>
          <button
            type='button'
            data-testid='room-tab-cost'
            onClick={() => setViewTab('cost')}
            className={classNames(
              'px-12px py-5px rd-6px text-12px font-600 transition-all border-0 cursor-pointer flex items-center gap-6px',
              viewTab === 'cost'
                ? 'bg-bg-1 text-primary-6 shadow-xs'
                : 'bg-transparent text-t-secondary hover:text-t-primary'
            )}
          >
            <span>💰</span>
            <span>{t('team.sharedRoom.tabCostProfiler', 'Cost & Profiler')}</span>
          </button>
        </div>

        {/* Participating Leader Pills */}
        <div className='flex items-center gap-6px flex-wrap'>
          {room.members.map((member) => {
            const accent = teamColorMap.get(member.team_id) ?? '#165DFF';
            const slug = mentionSlug(member.team_name);
            const isWorkingHandoff = Boolean(member.pending_handoff_msg_id);
            return (
              <Tooltip
                key={member.team_id}
                content={t('team.sharedRoom.memberPillTooltip', { slug, name: member.team_name })}
              >
                <button
                  type='button'
                  className='h-26px px-8px rd-999px inline-flex items-center gap-5px text-12px bg-fill-2 hover:bg-fill-3 border border-solid border-arco-2 cursor-pointer transition-colors'
                  onClick={(e) => {
                    if (e.shiftKey) {
                      void navigate(`/team/${member.team_id}`);
                    } else {
                      insertMention(slug);
                    }
                  }}
                >
                  <span className='w-7px h-7px rd-full shrink-0' style={{ backgroundColor: accent }} />
                  <span className='font-500 max-w-120px truncate'>{member.team_name}</span>
                  <span className='text-11px text-t-tertiary'>· {member.leader_name} 👑</span>
                  {member.is_host && (
                    <span title={t('team.sharedRoom.hostChairTitle')} className='text-11px'>
                      🪑
                    </span>
                  )}
                  {isWorkingHandoff && (
                    <span
                      title={t('team.sharedRoom.workingHandoffTitle')}
                      className='w-6px h-6px rd-full bg-primary-6 animate-pulse'
                    />
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* Header Actions */}
        <div className='flex items-center gap-8px shrink-0 flex-wrap'>
          {activeHubTeamId && (
            <div className='inline-flex items-center gap-6px'>
              <TeamContextCompactPopover
                slots={hubSlots}
                autoCompactEnabled={hubAutoCompactEnabled}
                autoCompactThresholdPct={hubAutoCompactThresholdPct}
                compacting={hubCompacting}
                onToggleAutoCompact={hubToggleAutoCompact}
                onCompactAll={() => hubCompactTeam({ mode: 'auto' })}
                onCompactSlot={(slotId) => hubCompactTeam({ slot_id: slotId, mode: 'auto' })}
              >
                <button
                  type='button'
                  data-testid='shared-room-context-pill'
                  data-context-level={hubHighestLevel}
                  className={classNames(
                    'h-28px px-9px rd-8px inline-flex items-center gap-5px text-11px font-600 border border-solid cursor-pointer transition-colors',
                    hubSlots.length > 0 && hubHighestLevel === 'critical'
                      ? 'bg-red-500/12 border-red-500/30 text-red-700 dark:text-red-300'
                      : hubSlots.length > 0 && hubHighestLevel === 'warning'
                        ? 'bg-amber-500/12 border-amber-500/30 text-amber-700 dark:text-amber-300'
                        : 'bg-fill-2 hover:bg-fill-3 border-arco-2 text-t-primary'
                  )}
                >
                  <span className='font-mono'>
                    {t('team.modelHub.contextSummaryLabel', 'Context {{pct}}%', { pct: hubMaxUsagePercent })}
                  </span>
                  {hubAutoCompactEnabled && (
                    <span className='px-4px py-0.5px rd-4px bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-10px'>
                      {t('team.modelHub.autoCompactShort', 'Auto {{threshold}}%', {
                        threshold: hubAutoCompactThresholdPct,
                      })}
                    </span>
                  )}
                </button>
              </TeamContextCompactPopover>

              <button
                type='button'
                data-testid='shared-room-compact-btn'
                disabled={hubCompacting}
                onClick={() => void handleRoomQuickCompact()}
                className='h-28px px-10px rd-8px inline-flex items-center gap-5px text-12px font-500 bg-fill-2 hover:bg-fill-3 border border-solid border-arco-2 cursor-pointer text-t-primary disabled:opacity-50'
              >
                <Lightning theme='outline' size='13' fill='currentColor' />
                <span>{t('team.modelHub.compactBtn', 'Compact Context')}</span>
              </button>

              <ConnectedModelPickerPopover
                disabled={hubSwitchingModels}
                showScopeSelector
                showForceInterrupt
                teamOptions={room.members}
                selectedTeamId={activeHubTeamId}
                onSelectTeamId={setSelectedHubTeamId}
                panelTestId='shared-room-switch-models-panel'
                onSelectModel={handleRoomSwitchModels}
              >
                <button
                  type='button'
                  data-testid='shared-room-switch-models-btn'
                  disabled={hubSwitchingModels}
                  className='h-28px px-10px rd-8px inline-flex items-center gap-5px text-12px font-500 bg-fill-2 hover:bg-fill-3 border border-solid border-arco-2 cursor-pointer text-t-primary disabled:opacity-50'
                >
                  <Exchange theme='outline' size='13' fill='currentColor' />
                  <span>{t('team.modelHub.switchTeamModelsBtn', 'Switch Team Models')}</span>
                </button>
              </ConnectedModelPickerPopover>
            </div>
          )}

          <Popover
            trigger='click'
            position='br'
            className='aion-telegram-bridge-popover'
            style={{ width: 372, maxWidth: 'calc(100vw - 24px)' }}
            popupVisible={tgPopoverOpen}
            onVisibleChange={setTgPopoverOpen}
            content={tgRoomPopoverContent}
          >
            <button
              type='button'
              data-testid='shared-room-telegram-btn'
              className='h-28px px-10px rd-8px inline-flex items-center gap-6px text-12px font-500 bg-fill-2 hover:bg-fill-3 border border-solid border-arco-2 cursor-pointer text-t-primary'
            >
              <span className='text-[#2AABEE] inline-flex items-center'>
                <TelegramIcon size={13} />
              </span>
              <span>Telegram</span>
              {(room.is_active_dm_target || room.telegram_chat_id) && (
                <span className='w-6px h-6px rd-full bg-success-6' />
              )}
            </button>
          </Popover>

          <Tooltip content={t('team.sharedRoom.configModalTooltip')}>
            <Button
              size='small'
              type='secondary'
              data-testid='shared-room-edit-btn'
              icon={<EditOne theme='outline' size='14' fill='currentColor' />}
              onClick={() => setEditModalOpen(true)}
            />
          </Tooltip>

          <Tooltip content={t('team.sharedRoom.deleteRoomTooltip')}>
            <Button
              size='small'
              type='secondary'
              status='danger'
              data-testid='shared-room-delete-btn'
              icon={<Delete theme='outline' size='14' fill='currentColor' />}
              onClick={handleDeleteCurrentRoom}
            />
          </Tooltip>

          <Badge count={openTasksCount} dot={false} maxCount={99} offset={[-3, 3]}>
            <Button
              size='small'
              type={rightPanelOpen ? 'primary' : 'secondary'}
              onClick={() => setRightPanelOpen((v) => !v)}
            >
              <span className='inline-flex items-center gap-6px'>
                <Inbox theme='outline' size='14' fill='currentColor' />
                <span>{t('team.sharedRoom.taskAndFileBtn')}</span>
              </span>
            </Button>
          </Badge>
        </div>
      </header>

      {/* Anti-Loop Guard Banner */}
      {isHopLimitReached && (
        <div className='shrink-0 bg-warning-1 border-b border-warning-3 px-16px py-8px flex items-center justify-between gap-12px'>
          <span className='text-12px text-t-primary'>
            ⏸ {t('team.sharedRoom.antiLoopBannerText', { max: room.max_hops })}
          </span>
          <Button size='mini' type='primary' loading={allowingHops} onClick={() => void handleAllowMoreHops()}>
            ✅ {t('team.sharedRoom.allowMoreHopsBtn')}
          </Button>
        </div>
      )}

      {/* Body: Main Multi-Leader Stage + Right Preview Panel */}
      <div className='flex-1 min-h-0 flex overflow-hidden'>
        {viewTab === 'chat' && (
          <div className='flex-1 min-w-0 flex flex-col h-full'>
          <div className='flex-1 min-h-0 overflow-y-auto px-20px py-16px flex flex-col gap-14px'>
            {room.rules && (
              <div className='rd-8px bg-fill-1 border border-dashed border-arco-2 px-12px py-8px text-12px text-t-secondary'>
                <b>📌 {t('team.sharedRoom.roomRulesLabel')}</b> {room.rules}
              </div>
            )}

            {messagesLoading && messages.length === 0 ? (
              <div className='py-40px flex items-center justify-center'>
                <Spin size={22} />
              </div>
            ) : messages.length === 0 ? (
              <div className='my-auto py-32px flex flex-col items-center justify-center gap-10px text-center text-t-tertiary'>
                <Peoples theme='outline' size='32' fill='currentColor' />
                <div className='text-14px font-500 text-t-secondary'>
                  {t('team.sharedRoom.emptyRoomReady', { count: room.members.length })}
                </div>
                <div className='max-w-460px text-12px leading-18px'>
                  {t('team.sharedRoom.emptyRoomHint')}
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                if (msg.sender_type === 'system') {
                  return (
                    <div key={msg.id} className='flex justify-center my-2px'>
                      <div className='max-w-[85%] rd-999px bg-fill-2 px-14px py-5px text-11px text-t-secondary text-center'>
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                const isUser = msg.sender_type === 'user';
                const replied = msg.reply_to_id ? messageById.get(msg.reply_to_id) : undefined;
                const accent = msg.sender_team_id ? (teamColorMap.get(msg.sender_team_id) ?? '#165DFF') : '#165DFF';
                const targetNames = (msg.target_team_ids ?? [])
                  .map((tid) => room.members.find((m) => m.team_id === tid)?.team_name ?? tid)
                  .filter(Boolean);

                if (isUser) {
                  return (
                    <div key={msg.id} className='flex flex-col items-end gap-4px'>
                      <div className='flex items-center gap-6px text-11px text-t-tertiary'>
                        <span>{msg.sender_label || t('team.sharedRoom.userSenderLabel')}</span>
                        <span>• {formatShortTime(msg.created_at)}</span>
                      </div>
                      <div
                        className='max-w-[78%] rd-12px rd-tr-2px px-14px py-10px shadow-sm flex flex-col gap-8px'
                        style={{ backgroundColor: '#165DFF', color: '#FFFFFF' }}
                      >
                        {replied && (
                          <div className='rd-6px bg-black/15 px-8px py-4px text-11px opacity-90 truncate'>
                            ↩ {t('team.sharedRoom.replyPreviewPrefix', { sender: replied.sender_label })} {replied.content.slice(0, 90)}
                          </div>
                        )}
                        <div className='text-13px leading-20px whitespace-pre-wrap break-words'>{msg.content}</div>
                      </div>
                      {msg.attachments?.length > 0 && (
                        <div className='flex flex-wrap justify-end gap-6px max-w-[78%]'>
                          {msg.attachments.map((art) => (
                            <ArtifactCard key={art.staged_path} artifact={art} />
                          ))}
                        </div>
                      )}
                      {targetNames.length > 0 && (
                        <span className='text-11px text-t-tertiary'>
                          ⚡ {t('team.sharedRoom.routedToLeaderPrefix', { names: targetNames.join(', ') })}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className='group flex items-start gap-10px max-w-[86%]'>
                    <div
                      className='w-30px h-30px rd-8px shrink-0 flex items-center justify-center text-white text-12px font-700 mt-2px'
                      style={{ backgroundColor: accent }}
                    >
                      👑
                    </div>
                    <div className='flex flex-col gap-4px min-w-0 flex-1'>
                      <div className='flex items-center gap-8px flex-wrap'>
                        <span className='text-12px font-600' style={{ color: accent }}>
                          [{msg.sender_label}]
                        </span>
                        <span className='text-11px text-t-tertiary'>{formatShortTime(msg.created_at)}</span>
                        {msg.hop_index > 0 && (
                          <span className='text-10px px-5px py-1px rd-4px bg-fill-2 text-t-tertiary'>
                            Hop #{msg.hop_index}
                          </span>
                        )}
                        <button
                          type='button'
                          className='opacity-0 group-hover:opacity-100 transition-opacity text-11px text-primary-6 bg-transparent border-0 cursor-pointer hover:underline p-0'
                          onClick={() => {
                            setReplyToMsg(msg);
                            textareaRef.current?.focus();
                          }}
                        >
                          ↩ {t('team.sharedRoom.replyToLeaderBtn')}
                        </button>
                        {msg.sender_team_id && (
                          <button
                            type='button'
                            className='opacity-0 group-hover:opacity-100 transition-opacity text-11px text-t-tertiary bg-transparent border-0 cursor-pointer hover:underline p-0'
                            onClick={() => void navigate(`/team/${msg.sender_team_id}`)}
                          >
                            {t('team.sharedRoom.openTeamLink')}
                          </button>
                        )}
                      </div>

                      <div
                        className='rd-12px rd-tl-2px bg-fill-2 px-14px py-10px border border-solid border-arco-2 flex flex-col gap-8px'
                        style={{ borderLeftWidth: 3, borderLeftColor: accent }}
                      >
                        {replied && (
                          <div className='rd-6px bg-fill-3 px-8px py-4px text-11px text-t-secondary truncate'>
                            ↩ {t('team.sharedRoom.responseToLeaderPrefix', { sender: replied.sender_label })} {replied.content.slice(0, 90)}
                          </div>
                        )}
                        <div className='text-13px leading-20px text-t-primary break-words [&_p]:my-4px [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-4px [&_ol]:my-4px [&_pre]:my-6px'>
                          <ReactMarkdown
                            remarkPlugins={MARKDOWN_REMARK_PLUGINS}
                            components={ROOM_MARKDOWN_COMPONENTS}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </div>

                      {msg.attachments?.length > 0 && (
                        <div className='flex flex-wrap gap-6px'>
                          {msg.attachments.map((art) => (
                            <ArtifactCard key={art.staged_path} artifact={art} />
                          ))}
                        </div>
                      )}

                      {targetNames.length > 0 && (
                        <span className='text-11px text-t-tertiary'>
                          ↪ {t('team.sharedRoom.forwardToLeaderPrefix', { names: targetNames.join(', ') })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={timelineEndRef} />
          </div>

            {/* Rounded Pill Composer (F20) */}
            <RoundedPillComposer
              roomId={room.id}
              roomName={room.name}
              members={room.members}
              activeWorktree={`wt/${room.name}`}
              isAgentRunning={room.members.some((m) => Boolean(m.pending_handoff_msg_id))}
              sending={sending}
              replyToMsg={replyToMsg}
              onClearReply={() => setReplyToMsg(null)}
              onSendMessage={async ({ content, files, wokenTargets, liveSteering }) => {
                if (!roomId || sending) return;
                setSending(true);
                try {
                  const res = await ipcBridge.sharedRoom.sendMessage.invoke({
                    id: roomId,
                    content,
                    files,
                    reply_to_id: replyToMsg?.id ?? null,
                    wake_targets: wokenTargets,
                    live_steering: liveSteering,
                  });
                  setReplyToMsg(null);
                  await Promise.all([
                    mutateMessages((prev) => {
                      const list = prev ?? [];
                      return list.some((m) => m.id === res.message.id) ? list : [...list, res.message];
                    }, true),
                    mutateRoom(),
                  ]);
                  if (res.routed_targets.length > 0) {
                    const names = res.routed_targets
                      .map((rt) => room?.members.find((m) => m.team_id === rt.team_id)?.team_name ?? rt.team_id)
                      .join(', ');
                    Message.success(t('team.sharedRoom.wokeLeaderSuccess', { names }));
                  }
                } catch (err) {
                  Message.error(t('team.sharedRoom.sendMessageFailed', { error: String(err) }));
                } finally {
                  setSending(false);
                }
              }}
              onSelectFiles={async () => {
                try {
                  const picked = await ipcBridge.dialog.showOpen.invoke({
                    properties: ['openFile', 'multiSelections'],
                  });
                  return picked ?? [];
                } catch (err) {
                  Message.error(t('team.sharedRoom.filePickFailed', { error: String(err) }));
                  return [];
                }
              }}
            />
          </div>
        )}

        {viewTab === 'kanban' && (
          <div className='flex-1 min-w-0 flex flex-col h-full overflow-hidden p-16px'>
            <div className='flex items-center justify-between pb-12px'>
              <div className='flex items-center gap-8px'>
                <span className='font-bold text-14px text-t-primary'>
                  {t('team.sharedRoom.kanban.title', 'Cross-Team Task Kanban')}
                </span>
                <Tag size='small' color='arcoblue'>
                  {tasks.length} {t('team.sharedRoom.kanban.tasksCount', 'tasks')}
                </Tag>
              </div>
              <Button
                size='small'
                type='primary'
                data-testid='kanban-create-task-btn'
                icon={<Plus theme='outline' size='14' fill='currentColor' />}
                onClick={() => {
                  setTaskToTeamId(room.members[0]?.team_id ?? '');
                  setTaskModalOpen(true);
                }}
              >
                {t('team.sharedRoom.createTaskBtn', 'New Task')}
              </Button>
            </div>
            <div className='flex-1 min-h-0'>
              <HybridKanbanBoard
                tasks={tasks}
                onTaskStatusChange={handleKanbanStatusChange}
                onSelectTask={(id) => {
                  setSelectedTaskId(id);
                  setRightPanelOpen(true);
                }}
                selectedTaskId={selectedTaskId}
              />
            </div>
          </div>
        )}

        {viewTab === 'cost' && (
          <div className='flex-1 min-w-0 flex flex-col h-full overflow-y-auto p-16px max-w-960px mx-auto w-full'>
            <TwoLaneProfiler
              modelTimeSec={26.0}
              toolTimeSec={22.2}
              totalTimeSec={48.2}
              showWalletCards={true}
              teamId={activeHubTeamId}
              roomTeams={room.members}
            />
          </div>
        )}

        {/* Hoisted 380px Preview & Profiler Panel (F21) */}
        <HoistedPreviewPanel
          open={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          selectedTaskId={selectedTaskId}
          task={tasks.find((t) => t.id === selectedTaskId)}
          worktreeLeaseId={`wt-${room.id}`}
          roomName={room.name}
          goalAncestry={['Release v2.4', room.name, tasks.find((t) => t.id === selectedTaskId)?.title ?? 'Main Stream']}
          onMergeSuccess={mutateTasks}
          teamId={activeHubTeamId}
          roomTeams={room.members}
        />
      </div>

      {/* Edit Shared Room Modal */}
      <SharedRoomFormModal
        visible={editModalOpen}
        mode='edit'
        initialRoom={room}
        onClose={() => setEditModalOpen(false)}
        onSaved={(updated) => {
          void mutateRoom(updated, false);
          void refreshRoomList();
        }}
      />

      {/* Create Cross-Team Task Modal */}
      <Modal
        title={t('team.sharedRoom.createTaskModalTitle')}
        visible={taskModalOpen}
        onCancel={() => setTaskModalOpen(false)}
        style={{ width: 520, maxWidth: 'calc(100vw - 32px)' }}
        footer={
          <div className='flex justify-end gap-8px'>
            <Button onClick={() => setTaskModalOpen(false)} disabled={taskSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              type='primary'
              data-testid='shared-room-task-submit-btn'
              loading={taskSaving}
              disabled={!taskToTeamId || !taskTitle.trim()}
              onClick={() => void handleCreateTask()}
            >
              {t('team.sharedRoom.createAndAssignTaskBtn')}
            </Button>
          </div>
        }
      >
        <div className='flex flex-col gap-12px text-t-primary'>
          <div className='grid grid-cols-2 gap-10px'>
            <div className='flex flex-col gap-4px'>
              <span className='text-12px font-500 text-t-secondary'>{t('team.sharedRoom.requestingTeamLabel')}</span>
              <Select
                allowClear
                placeholder={t('team.sharedRoom.directUserOption')}
                value={taskFromTeamId || undefined}
                onChange={(val) => setTaskFromTeamId((val as string) ?? '')}
              >
                {room.members.map((m) => (
                  <Select.Option key={m.team_id} value={m.team_id}>
                    {m.team_name}
                  </Select.Option>
                ))}
              </Select>
            </div>

            <div className='flex flex-col gap-4px'>
              <span className='text-12px font-500 text-t-secondary'>
                {t('team.sharedRoom.assignToTeamLabel')} <span className='text-danger-6'>*</span>
              </span>
              <Select
                data-testid='shared-room-task-to-select'
                placeholder={t('team.sharedRoom.selectRecipientTeamPlaceholder')}
                value={taskToTeamId || undefined}
                onChange={(val) => setTaskToTeamId(val as string)}
              >
                {room.members.map((m) => (
                  <Select.Option key={m.team_id} value={m.team_id}>
                    {m.team_name} ({m.leader_name} 👑)
                  </Select.Option>
                ))}
              </Select>
            </div>
          </div>

          <div className='flex flex-col gap-4px'>
            <span className='text-12px font-500 text-t-secondary'>
              {t('team.sharedRoom.taskTitleFieldLabel')} <span className='text-danger-6'>*</span>
            </span>
            <Input
              data-testid='shared-room-task-title-input'
              placeholder={t('team.sharedRoom.taskTitleFieldPlaceholder')}
              value={taskTitle}
              onChange={setTaskTitle}
            />
          </div>

          <div className='flex flex-col gap-4px'>
            <span className='text-12px font-500 text-t-secondary'>{t('team.sharedRoom.taskDescFieldLabel')}</span>
            <Input.TextArea
              data-testid='shared-room-task-desc-input'
              rows={3}
              placeholder={t('team.sharedRoom.taskDescFieldPlaceholder')}
              value={taskDescription}
              onChange={setTaskDescription}
            />
          </div>

          {tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length > 0 && (
            <div className='flex flex-col gap-4px'>
              <span className='text-12px font-500 text-t-secondary'>
                {t('team.sharedRoom.taskBlockedByLabel')}
              </span>
              <Select
                data-testid='shared-room-task-blocked-by-select'
                mode='multiple'
                placeholder={t('team.sharedRoom.taskBlockedByPlaceholder')}
                value={taskBlockedBy}
                onChange={(vals) => setTaskBlockedBy(vals as string[])}
              >
                {tasks
                  .filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
                  .map((t) => (
                    <Select.Option key={t.id} value={t.id}>
                      {t.title} (@{t.to_team_name})
                    </Select.Option>
                  ))}
              </Select>
            </div>
          )}

          <div className='flex flex-col gap-6px'>
            <div className='flex items-center justify-between'>
              <span className='text-12px font-500 text-t-secondary'>{t('team.sharedRoom.taskAttachFilesLabel')}</span>
              <Button size='mini' type='outline' onClick={() => void handlePickTaskFiles()}>
                {t('team.sharedRoom.taskSelectFilesBtn')}
              </Button>
            </div>
            {taskFiles.length > 0 && (
              <div className='flex flex-wrap gap-6px'>
                {taskFiles.map((fp) => (
                  <Tag key={fp} closable onClose={() => setTaskFiles((prev) => prev.filter((item) => item !== fp))}>
                    {fp.split(/[\\/]/).pop() ?? fp}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SharedRoomPage;
