/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Communication, Delete, EditOne, Plus, Pushpin, Right } from '@icon-park/react';
import { Message, Modal, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iconColors } from '@renderer/styles/colors';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { blurActiveElement } from '@renderer/utils/ui/focus';
import { useSharedRoomList } from '@renderer/pages/shared-room/hooks/useSharedRoomList';
import SharedRoomFormModal from '@renderer/pages/shared-room/SharedRoomFormModal';
import type { ISharedRoom } from '@/common/types/sharedRoom';
import SiderItem from './SiderItem';
import type { SiderMenuItem } from './SiderItem';

const SHARED_ROOM_PINNED_KEY = 'shared-room-pinned-ids';
const SHARED_ROOM_EXPANDED_KEY = 'shared-room-section-expanded';

type SiderTooltipProps = React.ComponentProps<typeof Tooltip>;

interface SharedRoomSiderSectionProps {
  collapsed: boolean;
  pathname: string;
  siderTooltipProps: Partial<SiderTooltipProps>;
  onSessionClick?: () => void;
}

const SharedRoomSiderSection: React.FC<SharedRoomSiderSectionProps> = ({
  collapsed,
  pathname,
  siderTooltipProps,
  onSessionClick,
}) => {
  const navigate = useNavigate();
  const { rooms, mutate: refreshRooms, removeRoom } = useSharedRoomList();

  const [createVisible, setCreateVisible] = useState(false);
  const [editingRoom, setEditingRoom] = useState<ISharedRoom | null>(null);
  const [expanded, setExpanded] = useState<boolean>(() => {
    const raw = localStorage.getItem(SHARED_ROOM_EXPANDED_KEY);
    return raw === null ? true : raw === 'true';
  });

  useEffect(() => {
    localStorage.setItem(SHARED_ROOM_EXPANDED_KEY, String(expanded));
  }, [expanded]);

  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SHARED_ROOM_PINNED_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(SHARED_ROOM_PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const sortedRooms = useMemo(() => {
    const pinned = rooms.filter((r) => pinnedIds.includes(r.id));
    const unpinned = rooms.filter((r) => !pinnedIds.includes(r.id));
    return [...pinned, ...unpinned];
  }, [rooms, pinnedIds]);

  const handleRoomClick = useCallback(
    (roomId: string) => {
      cleanupSiderTooltips();
      blurActiveElement();
      Promise.resolve(navigate(`/shared-room/${roomId}`)).catch(console.error);
      if (onSessionClick) onSessionClick();
    },
    [navigate, onSessionClick]
  );

  const handleDeleteRoom = useCallback(
    (room: ISharedRoom) => {
      Modal.confirm({
        title: 'Xóa Phòng Họp Liên Team?',
        content: `Phòng "${room.name}" sẽ bị xóa khỏi danh sách kênh chung (các Team thành viên vẫn được giữ nguyên 100%).`,
        okText: 'Xóa phòng',
        cancelText: 'Huỷ',
        okButtonProps: { status: 'danger' },
        onOk: async () => {
          try {
            await removeRoom(room.id);
            Message.success(`Đã xóa phòng "${room.name}"`);
            if (window.location.hash.includes(`/shared-room/${room.id}`)) {
              window.location.hash = '#/';
            }
          } catch (err) {
            Message.error(`Không thể xóa phòng: ${String(err)}`);
          }
        },
      });
    },
    [removeRoom]
  );

  return (
    <>
      {collapsed ? (
        sortedRooms.length > 0 && (
          <div className='shrink-0 flex flex-col gap-2px'>
            {sortedRooms.map((room) => {
              const isActive = pathname.startsWith(`/shared-room/${room.id}`);
              const isPaused = room.hop_count_since_human >= room.max_hops;
              return (
                <Tooltip
                  key={room.id}
                  {...siderTooltipProps}
                  content={`#${room.name} (${room.members.length} Teams)`}
                  position='right'
                >
                  <div
                    data-testid={`collapsed-shared-room-item-${room.id}`}
                    className={classNames(
                      'relative w-full h-40px flex items-center justify-center cursor-pointer transition-colors rd-8px',
                      isActive ? '!bg-active' : 'hover:bg-fill-3 active:bg-fill-4'
                    )}
                    onClick={() => handleRoomClick(room.id)}
                  >
                    <Communication
                      theme='outline'
                      size='16'
                      fill={iconColors.primary}
                      style={{ lineHeight: 0 }}
                    />
                    {isPaused && (
                      <span className='absolute top-4px end-4px w-8px h-8px rounded-full bg-warning-6' />
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        )
      ) : (
        <div className='shrink-0 flex flex-col gap-2px'>
          <div
            className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-6px cursor-pointer'
            data-testid='shared-room-section-toggle'
            onClick={() => setExpanded((v) => !v)}
          >
            <span className='text-14px text-t-tertiary sider-section-title group-hover/label:text-t-primary transition-colors font-[500] leading-none'>
              Kênh Liên Team
            </span>
            <span className='ms-2px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary shrink-0'>
              <Right
                theme='outline'
                size={12}
                className={classNames('transition-transform duration-150', { 'rotate-90': expanded })}
              />
            </span>
            <Tooltip content='Tạo Phòng Họp Liên Team mới' position='top'>
              <div
                data-testid='shared-room-create-btn'
                className='ms-auto -me-4px size-20px rd-4px flex items-center justify-center hover:bg-fill-4 transition-all shrink-0 cursor-pointer text-t-secondary hover:text-t-primary'
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateVisible(true);
                }}
              >
                <Plus
                  theme='outline'
                  size='14'
                  fill='currentColor'
                  className='block leading-none'
                  style={{ lineHeight: 0 }}
                />
              </div>
            </Tooltip>
          </div>

          {expanded &&
            sortedRooms.map((room) => {
              const isPinned = pinnedIds.includes(room.id);
              const hasActiveHandoff = room.members.some((m) => Boolean(m.pending_handoff_msg_id));
              const isHopPaused = room.hop_count_since_human >= room.max_hops;

              const menuItems: SiderMenuItem[] = [
                {
                  key: 'pin',
                  icon: <Pushpin theme='outline' size='14' />,
                  label: isPinned ? 'Bỏ ghim' : 'Ghim kênh',
                },
                {
                  key: 'edit',
                  icon: <EditOne theme='outline' size='14' />,
                  label: 'Cấu hình phòng',
                },
                {
                  key: 'delete',
                  icon: <Delete theme='outline' size='14' />,
                  label: 'Xóa phòng',
                },
              ];

              return (
                <div key={room.id} className='relative group'>
                  <SiderItem
                    icon={
                      <Communication
                        theme='outline'
                        size='16'
                        fill='currentColor'
                        style={{ lineHeight: 0 }}
                      />
                    }
                    name={room.name}
                    selected={pathname.startsWith(`/shared-room/${room.id}`)}
                    pinned={isPinned}
                    menuItems={menuItems}
                    onMenuAction={(key) => {
                      if (key === 'pin') {
                        togglePin(room.id);
                      } else if (key === 'edit') {
                        setEditingRoom(room);
                      } else if (key === 'delete') {
                        handleDeleteRoom(room);
                      }
                    }}
                    onClick={() => handleRoomClick(room.id)}
                  />
                  {(isHopPaused || hasActiveHandoff) && (
                    <span
                      title={
                        isHopPaused
                          ? 'Đang tạm dừng chờ anh duyệt thêm lượt thảo luận'
                          : 'Có Leader đang xử lý handoff liên team'
                      }
                      className={classNames(
                        'absolute end-12px top-1/2 -translate-y-1/2 w-8px h-8px rounded-full pointer-events-none z-10 group-hover:hidden',
                        isHopPaused ? 'bg-warning-6' : 'bg-primary-6 animate-pulse'
                      )}
                    />
                  )}
                </div>
              );
            })}
        </div>
      )}

      <SharedRoomFormModal
        visible={createVisible}
        mode='create'
        onClose={() => setCreateVisible(false)}
        onSaved={(room) => {
          void refreshRooms();
          Promise.resolve(navigate(`/shared-room/${room.id}`)).catch(console.error);
        }}
      />

      <SharedRoomFormModal
        visible={Boolean(editingRoom)}
        mode='edit'
        initialRoom={editingRoom}
        onClose={() => setEditingRoom(null)}
        onSaved={() => {
          setEditingRoom(null);
          void refreshRooms();
        }}
      />
    </>
  );
};

export default SharedRoomSiderSection;
