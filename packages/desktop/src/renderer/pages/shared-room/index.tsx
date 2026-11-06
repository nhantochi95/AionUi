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
import { Communication, EditOne, Inbox, Peoples, Plus } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import SharedRoomFormModal from './SharedRoomFormModal';

const TEAM_ACCENT_PALETTE = [
  '#165DFF',
  '#00B42A',
  '#722ED1',
  '#FF7D00',
  '#0FC6C2',
  '#EB0AA4',
  '#3491FA',
  '#F53F3F',
];

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
    return new Date(ts).toLocaleTimeString('vi-VN', {
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

const ArtifactCard: React.FC<{ artifact: IStagedRoomArtifact }> = ({ artifact }) => (
  <div className='inline-flex items-center gap-8px px-10px py-6px rd-8px bg-fill-2 border border-solid border-border-2 text-12px max-w-full'>
    <span className='font-500 truncate max-w-200px' title={artifact.file_name}>
      {artifact.is_image ? '🖼️' : '📄'} {artifact.file_name}
    </span>
    <span className='text-11px text-t-tertiary shrink-0'>({formatBytes(artifact.size_bytes)})</span>
    <button
      type='button'
      className='text-11px text-primary-6 bg-transparent border-0 cursor-pointer hover:underline p-0 shrink-0'
      onClick={() => void ipcBridge.shell.openFile.invoke(artifact.staged_path)}
    >
      Mở
    </button>
    <button
      type='button'
      className='text-11px text-t-secondary bg-transparent border-0 cursor-pointer hover:underline p-0 shrink-0'
      onClick={() => void ipcBridge.shell.showItemInFolder.invoke(artifact.staged_path)}
    >
      Thư mục
    </button>
  </div>
);

const SharedRoomPage: React.FC = () => {
  const { id: roomId } = useParams<{ id: string }>();
  const navigate = useNavigate();

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

  const {
    data: tasksData,
    mutate: mutateTasks,
  } = useSWR<ISharedRoomTask[]>(
    roomId ? `shared-room/${roomId}/tasks` : null,
    () => ipcBridge.sharedRoom.listTasks.invoke({ room_id: roomId! }),
    { revalidateOnFocus: false }
  );

  const messages = messagesData ?? [];
  const tasks = tasksData ?? [];

  const [composerText, setComposerText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [replyToMsg, setReplyToMsg] = useState<ISharedRoomMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [allowingHops, setAllowingHops] = useState(false);

  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightTab, setRightTab] = useState<'tasks' | 'artifacts'>('tasks');
  const [editModalOpen, setEditModalOpen] = useState(false);

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
    return list.sort((a, b) => b.createdAt - a.createdAt);
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
      Message.error(`Không thể chọn file: ${String(err)}`);
    }
  }, []);

  const handlePickTaskFiles = useCallback(async () => {
    try {
      const picked = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile', 'multiSelections'],
      });
      if (picked && picked.length > 0) {
        setTaskFiles((prev) => Array.from(new Set([...prev, ...picked])));
      }
    } catch (err) {
      Message.error(`Không thể chọn file cho task: ${String(err)}`);
    }
  }, []);

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
      await Promise.all([mutateMessages(), mutateRoom()]);
      if (res.routed_targets.length > 0) {
        const names = res.routed_targets
          .map((rt) => room?.members.find((m) => m.team_id === rt.team_id)?.team_name ?? rt.team_id)
          .join(', ');
        Message.success(`Đã đánh thức Leader: ${names}`);
      }
    } catch (err) {
      Message.error(`Gửi tin nhắn thất bại: ${String(err)}`);
    } finally {
      setSending(false);
    }
  }, [attachedFiles, composerText, mutateMessages, mutateRoom, replyToMsg, room?.members, roomId, sending]);

  const handleAllowMoreHops = useCallback(async () => {
    if (!roomId || allowingHops) return;
    setAllowingHops(true);
    try {
      const updated = await ipcBridge.sharedRoom.allowMoreHops.invoke({ id: roomId, grant_hops: 5 });
      await mutateRoom(updated, false);
      Message.success('Đã cấp thêm 5 lượt thảo luận tự động cho các Leader');
    } catch (err) {
      Message.error(`Không thể mở khoá lượt thảo luận: ${String(err)}`);
    } finally {
      setAllowingHops(false);
    }
  }, [allowingHops, mutateRoom, roomId]);

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
            ? 'Đã đặt Phòng Họp này làm kênh nhận tin nhắn trực tiếp trên Telegram DM'
            : 'Đã gỡ Phòng Họp khỏi kênh mặc định trên Telegram DM'
        );
      } catch (err) {
        Message.error(`Không thể cập nhật Telegram DM: ${String(err)}`);
      } finally {
        setTgSaving(false);
      }
    },
    [mutateRoom, roomId]
  );

  const handleSaveRoomTelegramGroup = useCallback(async () => {
    if (!roomId) return;
    if (!tgChatId.trim()) {
      Message.warning('Vui lòng nhập Group Chat ID (ví dụ: -1001234567890)');
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
      Message.success('Đã gắn Phòng Họp với Nhóm / Topic Telegram');
    } catch (err) {
      Message.error(`Không thể gắn nhóm Telegram: ${String(err)}`);
    } finally {
      setTgSaving(false);
    }
  }, [mutateRoom, roomId, tgChatId, tgThreadId]);

  const handleClearRoomTelegramGroup = useCallback(async () => {
    if (!roomId) return;
    setTgSaving(true);
    try {
      const updated = await ipcBridge.sharedRoom.deleteTelegramBinding.invoke({ id: roomId });
      setTgChatId('');
      setTgThreadId('');
      await mutateRoom(updated, false);
      Message.success('Đã gỡ gắn Nhóm / Topic Telegram');
    } catch (err) {
      Message.error(`Không thể gỡ gắn nhóm: ${String(err)}`);
    } finally {
      setTgSaving(false);
    }
  }, [mutateRoom, roomId]);

  const handleCreateTask = useCallback(async () => {
    if (!roomId) return;
    if (!taskToTeamId) {
      Message.warning('Vui lòng chọn Team nhận task');
      return;
    }
    if (!taskTitle.trim()) {
      Message.warning('Vui lòng nhập tiêu đề task liên team');
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
      Message.success('Đã tạo Task Liên Team & đồng bộ cho Leader');
    } catch (err) {
      Message.error(`Không thể tạo task liên team: ${String(err)}`);
    } finally {
      setTaskSaving(false);
    }
  }, [mutateTasks, roomId, taskBlockedBy, taskDescription, taskFiles, taskFromTeamId, taskTitle, taskToTeamId]);

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
            ? 'Đã đánh dấu hoàn thành (tự động mở khoá & đánh thức Team phụ thuộc nếu có)'
            : 'Đã cập nhật trạng thái task'
        );
      } catch (err) {
        Message.error(`Không thể cập nhật task: ${String(err)}`);
      }
    },
    [mutateTasks, roomId]
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
        <Empty description='Không tìm thấy Phòng Họp Liên Team này' />
        <Button type='outline' onClick={() => void navigate('/guid')}>
          Quay về trang chính
        </Button>
      </div>
    );
  }

  const isHopLimitReached = room.hop_count_since_human >= room.max_hops;
  const openTasksCount = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length;

  const tgRoomPopoverContent = (
    <div className='w-320px flex flex-col gap-10px p-4px text-t-primary'>
      <div className='flex items-center justify-between border-b border-border-2 pb-8px'>
        <span className='text-13px font-600'>Đồng bộ Telegram · #{room.name}</span>
        {room.is_active_dm_target && (
          <Tag size='small' color='arcoblue'>
            Đang chọn trên DM
          </Tag>
        )}
      </div>

      <div className='flex items-center justify-between gap-10px'>
        <div className='flex flex-col gap-2px'>
          <span className='text-12px font-500'>Đặt làm kênh chat trên DM 1-1</span>
          <span className='text-11px text-t-tertiary leading-15px'>
            Nhắn thẳng vào Bot Telegram sẽ gửi vào Phòng Họp Liên Team này (hoặc gõ <code>/room</code>)
          </span>
        </div>
        <Switch
          size='small'
          checked={room.is_active_dm_target}
          loading={tgSaving}
          onChange={(val) => void handleToggleRoomDmTarget(val)}
        />
      </div>

      <div className='border-t border-border-2 pt-8px flex flex-col gap-6px'>
        <span className='text-12px font-500 text-t-secondary'>Gắn với Telegram Group / Topic riêng</span>
        <Input
          size='small'
          placeholder='Group Chat ID (vd: -1001234567890)'
          value={tgChatId}
          onChange={setTgChatId}
        />
        <Input
          size='small'
          placeholder='Topic Thread ID (tuỳ chọn, vd: 99)'
          value={tgThreadId}
          onChange={setTgThreadId}
        />
        <div className='flex items-center justify-end gap-6px mt-2px'>
          {room.telegram_chat_id && (
            <Button size='mini' status='danger' disabled={tgSaving} onClick={() => void handleClearRoomTelegramGroup()}>
              Gỡ gắn
            </Button>
          )}
          <Button size='mini' type='primary' loading={tgSaving} onClick={() => void handleSaveRoomTelegramGroup()}>
            Lưu gắn nhóm
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className='h-full w-full flex flex-col overflow-hidden bg-bg-1 text-t-primary'>
      {/* Top Header */}
      <header className='shrink-0 border-b border-border-2 px-16px py-10px flex flex-wrap items-center justify-between gap-10px bg-bg-1'>
        <div className='flex items-center gap-10px min-w-0 flex-1'>
          <span className='w-30px h-30px rd-8px bg-primary-6/12 text-primary-6 inline-flex items-center justify-center shrink-0'>
            <Communication theme='outline' size='17' fill='currentColor' />
          </span>
          <div className='flex flex-col min-w-0'>
            <div className='flex items-center gap-8px min-w-0'>
              <span className='text-15px font-600 truncate'>#{room.name}</span>
              <Tooltip content='Số lượt các Leader tự trao đổi chéo liên tiếp kể từ tin nhắn gần nhất của anh'>
                <Tag size='small' color={isHopLimitReached ? 'orangered' : 'gray'}>
                  Lượt tự động: {room.hop_count_since_human}/{room.max_hops}
                </Tag>
              </Tooltip>
            </div>
            {room.description && (
              <span className='text-11px text-t-tertiary truncate'>{room.description}</span>
            )}
          </div>
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
                content={`Click để gọi @${slug} • Shift+Click để mở trang Team "${member.team_name}"`}
              >
                <button
                  type='button'
                  className='h-26px px-8px rd-999px inline-flex items-center gap-5px text-12px bg-fill-2 hover:bg-fill-3 border border-solid border-border-2 cursor-pointer transition-colors'
                  onClick={(e) => {
                    if (e.shiftKey) {
                      void navigate(`/team/${member.team_id}`);
                    } else {
                      insertMention(slug);
                    }
                  }}
                >
                  <span
                    className='w-7px h-7px rd-full shrink-0'
                    style={{ backgroundColor: accent }}
                  />
                  <span className='font-500 max-w-120px truncate'>{member.team_name}</span>
                  <span className='text-11px text-t-tertiary'>· {member.leader_name} 👑</span>
                  {member.is_host && (
                    <span title='Team Chủ trì (Chair)' className='text-11px'>
                      🪑
                    </span>
                  )}
                  {isWorkingHandoff && (
                    <span
                      title='Đang xử lý yêu cầu từ phòng họp'
                      className='w-6px h-6px rd-full bg-primary-6 animate-pulse'
                    />
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* Header Actions */}
        <div className='flex items-center gap-8px shrink-0'>
          <Popover
            trigger='click'
            position='br'
            popupVisible={tgPopoverOpen}
            onVisibleChange={setTgPopoverOpen}
            content={tgRoomPopoverContent}
          >
            <button
              type='button'
              className='h-28px px-10px rd-8px inline-flex items-center gap-6px text-12px font-500 bg-fill-2 hover:bg-fill-3 border border-solid border-border-2 cursor-pointer text-t-primary'
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

          <Tooltip content='Cấu hình thành viên & quy tắc phòng họp'>
            <Button
              size='small'
              type='secondary'
              icon={<EditOne theme='outline' size='14' fill='currentColor' />}
              onClick={() => setEditModalOpen(true)}
            />
          </Tooltip>

          <Badge count={openTasksCount} dot={false} maxCount={99}>
            <Button
              size='small'
              type={rightPanelOpen ? 'primary' : 'secondary'}
              icon={<Inbox theme='outline' size='14' fill='currentColor' />}
              onClick={() => setRightPanelOpen((v) => !v)}
            >
              Task & File
            </Button>
          </Badge>
        </div>
      </header>

      {/* Anti-Loop Guard Banner */}
      {isHopLimitReached && (
        <div className='shrink-0 bg-warning-1 border-b border-warning-3 px-16px py-8px flex items-center justify-between gap-12px'>
          <span className='text-12px text-t-primary'>
            ⏸ <b>Bảo vệ chống lặp vô hạn:</b> Các Leader đã tự trao đổi liên tiếp đạt ngưỡng{' '}
            <b>{room.max_hops} lượt</b>. Anh có thể gửi chỉ đạo mới hoặc bấm nút bên phải để cấp thêm 5 lượt thảo luận.
          </span>
          <Button
            size='mini'
            type='primary'
            loading={allowingHops}
            onClick={() => void handleAllowMoreHops()}
          >
            ✅ Cho phép thảo luận tiếp (+5 lượt)
          </Button>
        </div>
      )}

      {/* Body: Main Multi-Leader Timeline + Right Collaboration Panel */}
      <div className='flex-1 min-h-0 flex overflow-hidden'>
        {/* Left: Chat Timeline + Composer */}
        <div className='flex-1 min-w-0 flex flex-col h-full'>
          <div className='flex-1 min-h-0 overflow-y-auto px-20px py-16px flex flex-col gap-14px'>
            {room.rules && (
              <div className='rd-8px bg-fill-1 border border-dashed border-border-2 px-12px py-8px text-12px text-t-secondary'>
                <b>📌 Quy tắc phối hợp của phòng:</b> {room.rules}
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
                  Phòng Họp Liên Team đã sẵn sàng ({room.members.length} Leader 👑)
                </div>
                <div className='max-w-460px text-12px leading-18px'>
                  Gắn <code>@TênTeam</code> hoặc <code>@all</code> để chỉ định Leader cụ thể, hoặc nhắn tự nhiên để hệ
                  thống tự định tuyến tới đúng Leader chuyên trách / Chủ trì.
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
                const accent = msg.sender_team_id
                  ? (teamColorMap.get(msg.sender_team_id) ?? '#165DFF')
                  : '#165DFF';
                const targetNames = (msg.target_team_ids ?? [])
                  .map((tid) => room.members.find((m) => m.team_id === tid)?.team_name ?? tid)
                  .filter(Boolean);

                if (isUser) {
                  return (
                    <div key={msg.id} className='flex flex-col items-end gap-4px'>
                      <div className='flex items-center gap-6px text-11px text-t-tertiary'>
                        <span>{msg.sender_label || 'Anh'}</span>
                        <span>• {formatShortTime(msg.created_at)}</span>
                      </div>
                      <div className='max-w-[78%] rd-12px rd-tr-2px bg-primary-6 text-white px-14px py-10px shadow-sm flex flex-col gap-8px'>
                        {replied && (
                          <div className='rd-6px bg-black/15 px-8px py-4px text-11px opacity-90 truncate'>
                            ↩ Trả lời <b>{replied.sender_label}</b>: {replied.content.slice(0, 90)}
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
                          ⚡ Đã định tuyến tới Leader: <b>{targetNames.join(', ')}</b>
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
                          ↩ Trả lời Leader này
                        </button>
                        {msg.sender_team_id && (
                          <button
                            type='button'
                            className='opacity-0 group-hover:opacity-100 transition-opacity text-11px text-t-tertiary bg-transparent border-0 cursor-pointer hover:underline p-0'
                            onClick={() => void navigate(`/team/${msg.sender_team_id}`)}
                          >
                            Mở Team ↗
                          </button>
                        )}
                      </div>

                      <div
                        className='rd-12px rd-tl-2px bg-fill-2 px-14px py-10px border border-solid border-border-2 flex flex-col gap-8px'
                        style={{ borderLeftWidth: 3, borderLeftColor: accent }}
                      >
                        {replied && (
                          <div className='rd-6px bg-fill-3 px-8px py-4px text-11px text-t-secondary truncate'>
                            ↩ Phản hồi <b>{replied.sender_label}</b>: {replied.content.slice(0, 90)}
                          </div>
                        )}
                        <div className='text-13px leading-20px text-t-primary whitespace-pre-wrap break-words'>
                          {msg.content}
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
                          ↪ Chuyển tiếp tới Leader: <b>{targetNames.join(', ')}</b>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={timelineEndRef} />
          </div>

          {/* Composer */}
          <div className='shrink-0 border-t border-border-2 px-16px py-10px bg-bg-1 flex flex-col gap-8px'>
            {replyToMsg && (
              <div className='flex items-center justify-between gap-8px rd-6px bg-fill-2 px-10px py-5px text-12px'>
                <span className='truncate text-t-secondary'>
                  ↩ Đang trả lời trực tiếp <b>[{replyToMsg.sender_label}]</b>: {replyToMsg.content.slice(0, 80)}
                </span>
                <button
                  type='button'
                  className='text-12px text-t-tertiary hover:text-t-primary bg-transparent border-0 cursor-pointer'
                  onClick={() => setReplyToMsg(null)}
                >
                  ✕
                </button>
              </div>
            )}

            {attachedFiles.length > 0 && (
              <div className='flex flex-wrap items-center gap-6px'>
                {attachedFiles.map((filePath) => {
                  const base = filePath.split(/[\\/]/).pop() ?? filePath;
                  return (
                    <Tag
                      key={filePath}
                      closable
                      onClose={() => setAttachedFiles((prev) => prev.filter((p) => p !== filePath))}
                    >
                      📎 {base}
                    </Tag>
                  );
                })}
              </div>
            )}

            {/* Quick @mention chips */}
            <div className='flex items-center gap-6px flex-wrap'>
              <span className='text-11px text-t-tertiary'>Gọi nhanh:</span>
              <button
                type='button'
                className='px-7px py-2px rd-999px text-11px bg-fill-2 hover:bg-fill-3 text-t-secondary border border-solid border-border-2 cursor-pointer'
                onClick={() => insertMention('all')}
              >
                @all
              </button>
              {room.members.map((m) => {
                const slug = mentionSlug(m.team_name);
                return (
                  <button
                    key={m.team_id}
                    type='button'
                    className='px-7px py-2px rd-999px text-11px bg-fill-2 hover:bg-fill-3 text-t-secondary border border-solid border-border-2 cursor-pointer'
                    onClick={() => insertMention(slug)}
                  >
                    @{slug}
                  </button>
                );
              })}
            </div>

            <div className='flex items-end gap-8px'>
              <Tooltip content='Đính kèm file vào kho Shared Artifacts & hộp thư chung của các Team'>
                <Button
                  type='secondary'
                  onClick={() => void handlePickFiles()}
                  className='!h-36px !px-10px shrink-0'
                >
                  📎
                </Button>
              </Tooltip>

              <textarea
                ref={textareaRef}
                rows={2}
                placeholder='Nhập chỉ đạo cho các Leader... (@tên-team để gọi đích danh, Enter để gửi, Shift+Enter xuống dòng)'
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                className='flex-1 min-w-0 rd-8px border border-solid border-border-2 bg-fill-1 px-12px py-8px text-13px text-t-primary resize-none focus:outline-none focus:border-primary-6'
              />

              <Button
                type='primary'
                loading={sending}
                disabled={!composerText.trim() && attachedFiles.length === 0}
                onClick={() => void handleSendMessage()}
                className='!h-36px !px-16px shrink-0'
              >
                Gửi
              </Button>
            </div>
          </div>
        </div>

        {/* Right Panel: Cross-Team Task Board & Shared Artifacts */}
        {rightPanelOpen && (
          <aside className='w-350px shrink-0 border-s border-border-2 bg-bg-1 flex flex-col h-full'>
            <div className='shrink-0 border-b border-border-2 px-12px py-8px flex items-center justify-between gap-6px'>
              <div className='flex items-center gap-4px'>
                <button
                  type='button'
                  className={classNames(
                    'px-10px py-4px rd-6px text-12px font-500 border-0 cursor-pointer transition-colors',
                    rightTab === 'tasks' ? 'bg-primary-6 text-white' : 'bg-fill-2 text-t-secondary hover:bg-fill-3'
                  )}
                  onClick={() => setRightTab('tasks')}
                >
                  Task Liên Team ({tasks.length})
                </button>
                <button
                  type='button'
                  className={classNames(
                    'px-10px py-4px rd-6px text-12px font-500 border-0 cursor-pointer transition-colors',
                    rightTab === 'artifacts' ? 'bg-primary-6 text-white' : 'bg-fill-2 text-t-secondary hover:bg-fill-3'
                  )}
                  onClick={() => setRightTab('artifacts')}
                >
                  Kho File ({allArtifacts.length})
                </button>
              </div>

              {rightTab === 'tasks' ? (
                <Button
                  size='mini'
                  type='outline'
                  icon={<Plus theme='outline' size='12' fill='currentColor' />}
                  onClick={() => {
                    setTaskToTeamId(room.members[0]?.team_id ?? '');
                    setTaskModalOpen(true);
                  }}
                >
                  Giao task
                </Button>
              ) : (
                <Button
                  size='mini'
                  type='text'
                  onClick={() => void ipcBridge.shell.openFile.invoke(room.artifacts_dir)}
                >
                  Mở thư mục
                </Button>
              )}
            </div>

            <div className='flex-1 min-h-0 overflow-y-auto p-12px flex flex-col gap-10px'>
              {rightTab === 'tasks' ? (
                tasks.length === 0 ? (
                  <div className='py-32px text-center text-12px text-t-tertiary leading-18px'>
                    Chưa có Task Liên Team nào. Anh hoặc các Leader có thể tạo task bàn giao kèm điều kiện phụ thuộc (
                    <code>blocked_by</code>).
                  </div>
                ) : (
                  tasks.map((task) => {
                    const unfinishedBlockers = (task.blocked_by ?? []).filter((depId) => {
                      const dep = taskById.get(depId);
                      return dep && dep.status !== 'completed';
                    });
                    const isBlocked = unfinishedBlockers.length > 0 && task.status !== 'completed';

                    return (
                      <div
                        key={task.id}
                        className='rd-8px border border-solid border-border-2 bg-fill-1 p-10px flex flex-col gap-6px'
                      >
                        <div className='flex items-start justify-between gap-6px'>
                          <span className='text-13px font-600 leading-18px'>{task.title}</span>
                          <Select
                            size='mini'
                            value={task.status}
                            style={{ width: 112 }}
                            onChange={(val) => void handleUpdateTaskStatus(task, val as SharedRoomTaskStatus)}
                          >
                            <Select.Option value='pending'>⏳ Chờ xử lý</Select.Option>
                            <Select.Option value='in_progress'>🔄 Đang làm</Select.Option>
                            <Select.Option value='completed'>✅ Hoàn thành</Select.Option>
                            <Select.Option value='cancelled'>🚫 Đã huỷ</Select.Option>
                          </Select>
                        </div>

                        <div className='text-11px text-t-secondary flex items-center gap-4px flex-wrap'>
                          <span>{task.from_team_name ? `Từ ${task.from_team_name}` : 'Từ Anh'}</span>
                          <span>→</span>
                          <Tag size='small' color='arcoblue'>
                            @{task.to_team_name}
                          </Tag>
                        </div>

                        {isBlocked && (
                          <div className='rd-6px bg-warning-1 px-8px py-4px text-11px text-warning-7'>
                            🔒 Đang chờ {unfinishedBlockers.length} task tiền đề hoàn thành (sẽ tự động đánh thức{' '}
                            <b>{task.to_team_name}</b> ngay khi mở khoá)
                          </div>
                        )}

                        {task.description && (
                          <div className='text-12px text-t-secondary whitespace-pre-wrap'>{task.description}</div>
                        )}

                        {task.result_summary && (
                          <div className='rd-6px bg-success-1 px-8px py-5px text-11px text-t-primary'>
                            <b>Kết quả bàn giao:</b> {task.result_summary}
                          </div>
                        )}

                        {task.artifacts?.length > 0 && (
                          <div className='flex flex-col gap-4px pt-2px'>
                            {task.artifacts.map((art) => (
                              <ArtifactCard key={art.staged_path} artifact={art} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )
              ) : allArtifacts.length === 0 ? (
                <div className='py-32px text-center text-12px text-t-tertiary leading-18px'>
                  Chưa có file chung nào. Mọi file đính kèm trong phòng họp sẽ tự động lưu tại{' '}
                  <code>Shared Artifacts</code> và đồng bộ sang <code>.shared-inbox/</code> của từng Team.
                </div>
              ) : (
                allArtifacts.map(({ artifact, sourceLabel, createdAt }) => (
                  <div
                    key={artifact.staged_path}
                    className='rd-8px border border-solid border-border-2 bg-fill-1 p-10px flex flex-col gap-6px'
                  >
                    <ArtifactCard artifact={artifact} />
                    <span className='text-11px text-t-tertiary'>
                      Chia sẻ bởi <b>{sourceLabel}</b> • {formatShortTime(createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Edit Shared Room Modal */}
      <SharedRoomFormModal
        visible={editModalOpen}
        mode='edit'
        initialRoom={room}
        onClose={() => setEditModalOpen(false)}
        onSaved={(updated) => {
          void mutateRoom(updated, false);
        }}
      />

      {/* Create Cross-Team Task Modal */}
      <Modal
        title='Giao Task Liên Team (Cross-Team Handoff)'
        visible={taskModalOpen}
        onCancel={() => setTaskModalOpen(false)}
        style={{ width: 520, maxWidth: 'calc(100vw - 32px)' }}
        footer={
          <div className='flex justify-end gap-8px'>
            <Button onClick={() => setTaskModalOpen(false)} disabled={taskSaving}>
              Huỷ
            </Button>
            <Button
              type='primary'
              loading={taskSaving}
              disabled={!taskToTeamId || !taskTitle.trim()}
              onClick={() => void handleCreateTask()}
            >
              Tạo & Giao cho Leader
            </Button>
          </div>
        }
      >
        <div className='flex flex-col gap-12px text-t-primary'>
          <div className='grid grid-cols-2 gap-10px'>
            <div className='flex flex-col gap-4px'>
              <span className='text-12px font-500 text-t-secondary'>Team yêu cầu (Tuỳ chọn)</span>
              <Select
                allowClear
                placeholder='Anh (Trực tiếp)'
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
                Giao cho Team <span className='text-danger-6'>*</span>
              </span>
              <Select
                placeholder='Chọn Team nhận'
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
              Tiêu đề công việc <span className='text-danger-6'>*</span>
            </span>
            <Input
              placeholder='Ví dụ: Implement UI từ OpenAPI spec đã chốt'
              value={taskTitle}
              onChange={setTaskTitle}
            />
          </div>

          <div className='flex flex-col gap-4px'>
            <span className='text-12px font-500 text-t-secondary'>Mô tả chi tiết / Tiêu chí bàn giao</span>
            <Input.TextArea
              rows={3}
              placeholder='Mô tả đầu vào, yêu cầu đầu ra...'
              value={taskDescription}
              onChange={setTaskDescription}
            />
          </div>

          {tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled').length > 0 && (
            <div className='flex flex-col gap-4px'>
              <span className='text-12px font-500 text-t-secondary'>
                Chờ Task tiền đề hoàn thành (<code>blocked_by</code>)
              </span>
              <Select
                mode='multiple'
                placeholder='Không chặn (đánh thức Leader ngay lập tức)'
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
              <span className='text-12px font-500 text-t-secondary'>Đính kèm file bàn giao</span>
              <Button size='mini' type='outline' onClick={() => void handlePickTaskFiles()}>
                📎 Chọn file
              </Button>
            </div>
            {taskFiles.length > 0 && (
              <div className='flex flex-wrap gap-6px'>
                {taskFiles.map((fp) => (
                  <Tag
                    key={fp}
                    closable
                    onClose={() => setTaskFiles((prev) => prev.filter((item) => item !== fp))}
                  >
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
