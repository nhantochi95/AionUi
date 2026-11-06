/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Input, InputNumber, Message, Modal, Select, Tag } from '@arco-design/web-react';
import React, { useEffect, useMemo, useState } from 'react';
import { ipcBridge } from '@/common';
import type { ISharedRoom } from '@/common/types/sharedRoom';
import { useTeamList } from '@renderer/pages/team/hooks/useTeamList';

interface SharedRoomFormModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialRoom?: ISharedRoom | null;
  onClose: () => void;
  onSaved: (room: ISharedRoom) => void;
}

const SharedRoomFormModal: React.FC<SharedRoomFormModalProps> = ({
  visible,
  mode,
  initialRoom,
  onClose,
  onSaved,
}) => {
  const { teams } = useTeamList();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [hostTeamId, setHostTeamId] = useState<string>('');
  const [maxHops, setMaxHops] = useState<number>(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && initialRoom) {
      setName(initialRoom.name);
      setDescription(initialRoom.description ?? '');
      setRules(initialRoom.rules ?? '');
      const memberIds = initialRoom.members.map((m) => m.team_id);
      setSelectedTeamIds(memberIds);
      setHostTeamId(initialRoom.host_team_id ?? memberIds[0] ?? '');
      setMaxHops(initialRoom.max_hops ?? 5);
    } else {
      setName('');
      setDescription('');
      setRules('');
      setSelectedTeamIds([]);
      setHostTeamId('');
      setMaxHops(5);
    }
  }, [initialRoom, mode, visible]);

  const selectedTeams = useMemo(
    () => teams.filter((t) => selectedTeamIds.includes(t.id)),
    [teams, selectedTeamIds]
  );

  useEffect(() => {
    if (selectedTeamIds.length === 0) {
      setHostTeamId('');
    } else if (!hostTeamId || !selectedTeamIds.includes(hostTeamId)) {
      setHostTeamId(selectedTeamIds[0]);
    }
  }, [hostTeamId, selectedTeamIds]);

  const toggleTeam = (teamId: string, checked: boolean) => {
    setSelectedTeamIds((prev) => {
      if (checked) {
        return prev.includes(teamId) ? prev : [...prev, teamId];
      }
      return prev.filter((id) => id !== teamId);
    });
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Message.warning('Vui lòng nhập tên Phòng Họp Liên Team');
      return;
    }
    if (selectedTeamIds.length === 0) {
      Message.warning('Vui lòng chọn ít nhất 1 Team tham gia phòng họp');
      return;
    }

    setSaving(true);
    try {
      let saved: ISharedRoom;
      if (mode === 'edit' && initialRoom) {
        saved = await ipcBridge.sharedRoom.update.invoke({
          id: initialRoom.id,
          name: trimmedName,
          description: description.trim(),
          rules: rules.trim(),
          team_ids: selectedTeamIds,
          host_team_id: hostTeamId || selectedTeamIds[0],
          max_hops: maxHops,
        });
        Message.success('Đã cập nhật Phòng Họp Liên Team');
      } else {
        saved = await ipcBridge.sharedRoom.create.invoke({
          name: trimmedName,
          description: description.trim(),
          rules: rules.trim(),
          team_ids: selectedTeamIds,
          host_team_id: hostTeamId || selectedTeamIds[0],
          max_hops: maxHops,
        });
        Message.success('Đã tạo Phòng Họp Liên Team mới');
      }
      onSaved(saved);
      onClose();
    } catch (err) {
      Message.error(`Không thể lưu Phòng Họp Liên Team: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={mode === 'edit' ? 'Chỉnh sửa Phòng Họp Liên Team' : 'Tạo Phòng Họp Liên Team (Leader Hub)'}
      visible={visible}
      onCancel={onClose}
      style={{ width: 640, maxWidth: 'calc(100vw - 32px)' }}
      footer={
        <div className='flex items-center justify-end gap-8px'>
          <Button onClick={onClose} disabled={saving}>
            Huỷ
          </Button>
          <Button
            type='primary'
            loading={saving}
            disabled={!name.trim() || selectedTeamIds.length === 0}
            data-testid='shared-room-submit-btn'
            onClick={() => void handleSubmit()}
          >
            {mode === 'edit' ? 'Lưu thay đổi' : 'Tạo Phòng Họp'}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-14px text-t-primary'>
        <div className='text-12px text-t-secondary leading-18px bg-fill-1 rd-8px px-12px py-8px border border-border-2'>
          Mỗi Team tham gia sẽ cử <b>Leader 👑</b> đại diện ngồi trong phòng chung cùng anh để trao đổi chéo, chuyển
          giao file qua <code>Shared Artifacts</code> và giao nhận task liên team (có hỗ trợ đồng bộ qua Telegram).
        </div>

        <div className='flex flex-col gap-4px'>
          <span className='text-13px font-500'>
            Tên phòng họp <span className='text-danger-6'>*</span>
          </span>
          <Input
            placeholder='Ví dụ: Kênh Phối Hợp NhanTown × VibeClip'
            value={name}
            onChange={setName}
            data-testid='shared-room-name-input'
          />
        </div>

        <div className='flex flex-col gap-4px'>
          <span className='text-13px font-500'>Mô tả mục tiêu chung</span>
          <Input
            placeholder='Mục tiêu dự án hoặc phạm vi phối hợp giữa các Team...'
            value={description}
            onChange={setDescription}
          />
        </div>

        <div className='flex flex-col gap-6px'>
          <div className='flex items-center justify-between'>
            <span className='text-13px font-500'>
              Chọn các Team tham gia ({selectedTeamIds.length}/{teams.length}) <span className='text-danger-6'>*</span>
            </span>
            {teams.length > 1 && (
              <button
                type='button'
                className='text-12px text-primary-6 bg-transparent border-0 cursor-pointer hover:underline p-0'
                onClick={() =>
                  setSelectedTeamIds(
                    selectedTeamIds.length === teams.length ? [] : teams.map((item) => item.id)
                  )
                }
              >
                {selectedTeamIds.length === teams.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              </button>
            )}
          </div>

          {teams.length === 0 ? (
            <div className='rd-8px border border-dashed border-border-2 p-16px text-center text-12px text-t-tertiary'>
              Chưa có Team nào. Hãy tạo ít nhất 1 Team ở mục Teams trước.
            </div>
          ) : (
            <div className='max-h-180px overflow-y-auto rd-8px border border-border-2 divide-y divide-border-1'>
              {teams.map((tItem) => {
                const checked = selectedTeamIds.includes(tItem.id);
                const leader =
                  tItem.assistants.find((a) => a.role === 'leader') ?? tItem.assistants[0];
                return (
                  <div
                    key={tItem.id}
                    className='flex items-center justify-between gap-10px px-12px py-8px hover:bg-fill-2 cursor-pointer transition-colors'
                    onClick={() => toggleTeam(tItem.id, !checked)}
                  >
                    <div className='flex items-center gap-10px min-w-0'>
                      <Checkbox
                        checked={checked}
                        onChange={(val) => toggleTeam(tItem.id, Boolean(val))}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className='flex flex-col min-w-0'>
                        <span className='text-13px font-500 truncate'>{tItem.name}</span>
                        <span className='text-11px text-t-tertiary truncate'>
                          Leader 👑: {leader?.assistant_name ?? 'Lead'} • {tItem.assistants.length} thành viên
                        </span>
                      </div>
                    </div>
                    {hostTeamId === tItem.id && checked && (
                      <Tag size='small' color='arcoblue'>
                        Chủ trì 🪑
                      </Tag>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className='grid grid-cols-2 gap-12px'>
          <div className='flex flex-col gap-4px'>
            <span className='text-12px font-500 text-t-secondary'>Leader Chủ trì (Chair Team)</span>
            <Select
              placeholder='Chọn Team chủ trì'
              value={hostTeamId || undefined}
              disabled={selectedTeams.length === 0}
              onChange={(val) => setHostTeamId(val as string)}
            >
              {selectedTeams.map((tItem) => (
                <Select.Option key={tItem.id} value={tItem.id}>
                  {tItem.name}
                </Select.Option>
              ))}
            </Select>
            <span className='text-11px text-t-tertiary'>
              Nhận điều phối khi tin nhắn không gắn <code>@TeamName</code> cụ thể
            </span>
          </div>

          <div className='flex flex-col gap-4px'>
            <span className='text-12px font-500 text-t-secondary'>Giới hạn lượt tự động (max_hops)</span>
            <InputNumber
              min={1}
              max={30}
              value={maxHops}
              onChange={(val) => setMaxHops(typeof val === 'number' ? val : 5)}
            />
            <span className='text-11px text-t-tertiary'>
              Tạm dừng để hỏi anh sau N lượt các Leader tự gọi nhau liên tiếp
            </span>
          </div>
        </div>

        <div className='flex flex-col gap-4px'>
          <span className='text-12px font-500 text-t-secondary'>Quy tắc phối hợp trong phòng (Tuỳ chọn)</span>
          <Input.TextArea
            rows={2}
            placeholder='Ví dụ: Team Backend chốt schema vào Shared Artifacts trước khi gọi @Frontend...'
            value={rules}
            onChange={setRules}
          />
        </div>
      </div>
    </Modal>
  );
};

export default SharedRoomFormModal;
