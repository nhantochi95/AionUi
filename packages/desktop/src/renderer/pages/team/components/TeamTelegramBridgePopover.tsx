/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Message, Popover, Select, Spin, Switch, Tag, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { ITeamTelegramBridgeConfig, TeamTelegramStreamMode } from '@/common/types/sharedRoom';

interface TeamTelegramBridgePopoverProps {
  teamId: string;
  teamName: string;
}

const TelegramPaperPlaneIcon: React.FC<{ className?: string; size?: number }> = ({ className, size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'
    className={className}
    aria-hidden='true'
  >
    <path
      d='M21.6 3.6L2.9 10.8C1.9 11.2 1.9 12.6 2.9 12.9L7.6 14.4L18.4 7.6C18.9 7.3 19.4 7.9 19 8.3L10.2 16.3L9.9 20.5C9.9 21.4 11 21.8 11.6 21.2L14.3 18.6L18.9 22C19.7 22.6 20.9 22.1 21.1 21.1L23.1 4.9C23.3 3.9 22.5 3.2 21.6 3.6Z'
      fill='currentColor'
    />
  </svg>
);

const TeamTelegramBridgePopover: React.FC<TeamTelegramBridgePopoverProps> = ({ teamId, teamName }) => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    data: config,
    isLoading,
    mutate,
  } = useSWR<ITeamTelegramBridgeConfig>(
    `channel/team-binding/${teamId}`,
    () => ipcBridge.channel.getTeamBinding.invoke({ team_id: teamId }),
    {
      revalidateOnFocus: false,
    }
  );

  const [groupChatId, setGroupChatId] = useState('');
  const [groupThreadId, setGroupThreadId] = useState('');
  const [showGroupSection, setShowGroupSection] = useState(false);

  useEffect(() => {
    if (!config) return;
    setGroupChatId(config.group_chat_id ?? '');
    setGroupThreadId(config.group_thread_id ?? '');
    if (config.group_chat_id) {
      setShowGroupSection(true);
    }
  }, [config]);

  useEffect(() => {
    const unsubStatus = ipcBridge.channel.pluginStatusChanged.on(() => {
      void mutate();
    });
    const unsubAuth = ipcBridge.channel.userAuthorized.on(() => {
      void mutate();
    });
    const unsubNotify = ipcBridge.team.proactiveNotification.on((ev) => {
      if (ev.team_id === teamId) {
        Message.info(`[${ev.team_name}] Đã gửi báo cáo chủ động (${ev.kind})`);
      }
    });
    return () => {
      unsubStatus();
      unsubAuth();
      unsubNotify();
    };
  }, [mutate, teamId]);

  const handleToggleNotify = useCallback(
    async (checked: boolean) => {
      setSaving(true);
      try {
        const updated = await ipcBridge.channel.upsertTeamBinding.invoke({
          team_id: teamId,
          notify_enabled: checked,
        });
        await mutate(updated, false);
        Message.success(checked ? 'Đã bật báo cáo chủ động qua Telegram' : 'Đã tắt báo cáo chủ động qua Telegram');
      } catch (err) {
        Message.error(`Không thể lưu cài đặt Telegram: ${String(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [mutate, teamId]
  );

  const handleToggleActiveDm = useCallback(
    async (checked: boolean) => {
      setSaving(true);
      try {
        const updated = await ipcBridge.channel.upsertTeamBinding.invoke({
          team_id: teamId,
          set_active_dm_target: checked,
        });
        await mutate(updated, false);
        Message.success(
          checked
            ? `Đã đặt "${teamName}" làm Team nhận tin nhắn trực tiếp trên Telegram DM`
            : `Đã gỡ "${teamName}" khỏi kênh mặc định trên Telegram DM`
        );
      } catch (err) {
        Message.error(`Không thể cập nhật DM target: ${String(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [mutate, teamId, teamName]
  );

  const handleStreamModeChange = useCallback(
    async (mode: TeamTelegramStreamMode) => {
      setSaving(true);
      try {
        const updated = await ipcBridge.channel.upsertTeamBinding.invoke({
          team_id: teamId,
          stream_mode: mode,
        });
        await mutate(updated, false);
        Message.success(
          mode === 'milestones'
            ? 'Đã chuyển sang chế độ Lọc thông minh (Milestones)'
            : 'Đã chuyển sang chế độ Gửi toàn bộ phiên (Full Stream)'
        );
      } catch (err) {
        Message.error(`Không thể đổi chế độ báo cáo: ${String(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [mutate, teamId]
  );

  const handleSaveGroupBinding = useCallback(async () => {
    const trimmedChat = groupChatId.trim();
    if (!trimmedChat) {
      Message.warning('Vui lòng nhập Telegram Group Chat ID (ví dụ: -1001234567890)');
      return;
    }
    setSaving(true);
    try {
      const updated = await ipcBridge.channel.upsertTeamBinding.invoke({
        team_id: teamId,
        group_chat_id: trimmedChat,
        group_thread_id: groupThreadId.trim() ? groupThreadId.trim() : null,
      });
      await mutate(updated, false);
      Message.success('Đã gắn Team với Nhóm / Topic Telegram');
    } catch (err) {
      Message.error(`Không thể lưu gắn nhóm: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [groupChatId, groupThreadId, mutate, teamId]);

  const handleClearGroupBinding = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await ipcBridge.channel.deleteTeamBinding.invoke({
        team_id: teamId,
      });
      setGroupChatId('');
      setGroupThreadId('');
      await mutate(updated, false);
      Message.success('Đã gỡ gắn Nhóm / Topic Telegram');
    } catch (err) {
      Message.error(`Không thể gỡ gắn nhóm: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [mutate, teamId]);

  const isConnectedAndPaired = Boolean(config?.telegram_connected && config?.has_authorized_user);
  const isActiveBridge = Boolean(
    isConnectedAndPaired && (config?.notify_enabled || config?.is_active_dm_target || config?.group_chat_id)
  );

  const dotColorClass = isActiveBridge
    ? 'bg-success-6'
    : config?.telegram_plugin_enabled
      ? 'bg-warning-6'
      : 'bg-fill-4';

  const popoverContent = (
    <div className='w-340px flex flex-col gap-12px p-4px text-t-primary'>
      <div className='flex items-center justify-between gap-8px border-b border-border-2 pb-10px'>
        <div className='flex items-center gap-8px min-w-0'>
          <span className='inline-flex w-26px h-26px rd-6px items-center justify-center bg-[#2AABEE]/15 text-[#2AABEE] shrink-0'>
            <TelegramPaperPlaneIcon size={15} />
          </span>
          <div className='flex flex-col min-w-0'>
            <span className='text-13px font-600 truncate'>Cầu nối Telegram · Leader 👑</span>
            <span className='text-11px text-t-tertiary truncate'>Team: {teamName}</span>
          </div>
        </div>
        {config?.telegram_connected ? (
          <Tag size='small' color={config.has_authorized_user ? 'green' : 'orangered'}>
            {config.bot_username ? `@${config.bot_username}` : 'Đã kết nối'}
          </Tag>
        ) : (
          <Tag size='small' color='gray'>
            Chưa bật Bot
          </Tag>
        )}
      </div>

      {isLoading && !config ? (
        <div className='py-16px flex items-center justify-center'>
          <Spin size={18} />
        </div>
      ) : (
        <>
          {(!config?.telegram_plugin_enabled || !config?.has_authorized_user) && (
            <div className='rd-8px bg-fill-2 p-10px flex flex-col gap-8px text-12px'>
              <span className='text-t-secondary leading-18px'>
                {!config?.telegram_plugin_enabled
                  ? 'Bot Telegram chưa được bật. Hãy bật Telegram trong Cài đặt WebUI / Kênh để dùng chung 1 Bot cho toàn bộ các Team.'
                  : 'Bot đã bật nhưng chưa ghép đôi tài khoản Telegram của anh. Hãy nhắn cho Bot để lấy mã ghép đôi.'}
              </span>
              <Button
                size='mini'
                type='outline'
                onClick={() => {
                  setVisible(false);
                  void navigate('/settings/webui');
                }}
              >
                Mở cài đặt Kênh Telegram
              </Button>
            </div>
          )}

          <div className='flex items-center justify-between gap-10px'>
            <div className='flex flex-col gap-2px'>
              <span className='text-13px font-500'>Báo cáo chủ động từ Leader</span>
              <span className='text-11px text-t-tertiary leading-16px'>
                Leader tự gửi tiến độ, câu hỏi xin duyệt, lỗi member & kết quả về điện thoại
              </span>
            </div>
            <Switch
              size='small'
              data-testid='team-tg-notify-switch'
              checked={Boolean(config?.notify_enabled)}
              loading={saving}
              onChange={(val) => void handleToggleNotify(val)}
            />
          </div>

          <div className='flex items-center justify-between gap-10px'>
            <div className='flex flex-col gap-2px'>
              <span className='text-13px font-500'>Chat chính trên DM 1-1</span>
              <span className='text-11px text-t-tertiary leading-16px'>
                Nhắn riêng với Bot sẽ vào thẳng Leader của Team này (hoặc gõ <code>/team</code> / vuốt Reply)
              </span>
            </div>
            <Switch
              size='small'
              data-testid='team-tg-dm-switch'
              checked={Boolean(config?.is_active_dm_target)}
              disabled={!config?.has_authorized_user}
              loading={saving}
              onChange={(val) => void handleToggleActiveDm(val)}
            />
          </div>

          <div className='flex flex-col gap-4px'>
            <span className='text-12px font-500 text-t-secondary'>Chế độ lọc thông báo</span>
            <Select
              size='small'
              data-testid='team-tg-stream-select'
              value={(config?.stream_mode as TeamTelegramStreamMode) || 'milestones'}
              disabled={saving}
              onChange={(val) => void handleStreamModeChange(val as TeamTelegramStreamMode)}
            >
              <Select.Option value='milestones'>Milestones — Lọc thông minh (Khuyên dùng)</Select.Option>
              <Select.Option value='full_stream'>Full Stream — Báo mọi phiên hoàn tất</Select.Option>
            </Select>
          </div>

          <div className='border-t border-border-2 pt-8px flex flex-col gap-8px'>
            <div
              data-testid='team-tg-group-toggle'
              className='flex items-center justify-between cursor-pointer select-none text-12px text-t-secondary hover:text-t-primary'
              onClick={() => setShowGroupSection((v) => !v)}
            >
              <span className='font-500'>
                Gắn Nhóm / Supergroup Topic riêng {config?.group_chat_id ? '• Đã gắn' : '(Tuỳ chọn)'}
              </span>
              <span className='text-11px text-t-tertiary'>{showGroupSection ? 'Thu gọn' : 'Mở rộng'}</span>
            </div>

            {showGroupSection && (
              <div className='flex flex-col gap-8px rd-8px bg-fill-1 p-8px border border-border-2'>
                <Input
                  size='small'
                  data-testid='team-tg-group-chat-input'
                  placeholder='Group Chat ID (vd: -1001234567890)'
                  value={groupChatId}
                  onChange={setGroupChatId}
                />
                <Input
                  size='small'
                  data-testid='team-tg-group-thread-input'
                  placeholder='Topic Thread ID (tuỳ chọn, vd: 42)'
                  value={groupThreadId}
                  onChange={setGroupThreadId}
                />
                <div className='flex items-center justify-end gap-6px'>
                  {config?.group_chat_id && (
                    <Button
                      size='mini'
                      status='danger'
                      data-testid='team-tg-group-clear-btn'
                      disabled={saving}
                      onClick={() => void handleClearGroupBinding()}
                    >
                      Gỡ gắn
                    </Button>
                  )}
                  <Button
                    size='mini'
                    type='primary'
                    data-testid='team-tg-group-save-btn'
                    loading={saving}
                    onClick={() => void handleSaveGroupBinding()}
                  >
                    Lưu gắn nhóm
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className='rd-6px bg-fill-1 px-8px py-6px text-11px text-t-tertiary leading-16px'>
            Mẹo trên Telegram: gõ <code>/team</code> đổi Team, <code>/room</code> vào Phòng Họp Liên Team,{' '}
            <code>/status</code> xem Task Board, hoặc <b>vuốt Reply</b> vào bất kỳ báo cáo nào để giao việc lại đúng
            Leader đó.
          </div>
        </>
      )}
    </div>
  );

  return (
    <Popover
      trigger='click'
      position='br'
      popupVisible={visible}
      onVisibleChange={(next) => {
        setVisible(next);
        if (next) void mutate();
      }}
      content={popoverContent}
    >
      <Tooltip content='Kết nối & báo cáo chủ động qua Telegram'>
        <button
          type='button'
          data-testid='team-telegram-bridge-btn'
          className='h-28px px-10px rd-8px inline-flex items-center gap-6px text-12px font-500 bg-fill-2 hover:bg-fill-3 active:bg-fill-4 text-t-primary border border-solid border-border-2 cursor-pointer transition-colors shrink-0'
        >
          <span className='text-[#2AABEE] inline-flex items-center'>
            <TelegramPaperPlaneIcon size={13} />
          </span>
          <span>Telegram</span>
          {config?.is_active_dm_target && (
            <span className='px-4px py-1px rd-4px bg-[#2AABEE]/15 text-[#2AABEE] text-10px font-600 leading-none'>
              DM
            </span>
          )}
          <span className={`w-6px h-6px rd-full ${dotColorClass}`} />
        </button>
      </Tooltip>
    </Popover>
  );
};

export default TeamTelegramBridgePopover;
