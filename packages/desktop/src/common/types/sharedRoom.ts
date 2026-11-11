/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type TeamTelegramStreamMode = 'milestones' | 'full_stream';

export interface ITeamTelegramBridgeConfig {
  team_id: string;
  telegram_plugin_enabled: boolean;
  telegram_connected: boolean;
  bot_username?: string | null;
  has_authorized_user: boolean;
  notify_enabled: boolean;
  stream_mode: TeamTelegramStreamMode | string;
  is_active_dm_target: boolean;
  group_chat_id?: string | null;
  group_thread_id?: string | null;
}

export interface IUpsertTeamTelegramBridgeParams {
  team_id: string;
  notify_enabled?: boolean;
  stream_mode?: TeamTelegramStreamMode;
  set_active_dm_target?: boolean;
  group_chat_id?: string | null;
  group_thread_id?: string | null;
  clear_group_binding?: boolean;
}

export interface ITeamProactiveNotificationEvent {
  user_id: string;
  team_id: string;
  team_name: string;
  kind: 'milestone' | 'approval_needed' | 'completed' | 'blocker' | string;
  summary: string;
  files: string[];
  created_at: number;
}

export interface IStagedRoomArtifact {
  file_name: string;
  staged_path: string;
  size_bytes: number;
  is_image: boolean;
}

export interface IRoutedTarget {
  team_id: string;
  reason: string;
  tier: number;
}

export interface ISharedRoomMember {
  team_id: string;
  team_name: string;
  workspace: string;
  leader_name: string;
  is_host: boolean;
  pending_handoff_msg_id?: string | null;
}

export interface ISharedRoom {
  id: string;
  name: string;
  description: string;
  rules: string;
  host_team_id?: string | null;
  max_hops: number;
  hop_count_since_human: number;
  artifacts_dir: string;
  members: ISharedRoomMember[];
  telegram_chat_id?: string | null;
  telegram_thread_id?: string | null;
  is_active_dm_target: boolean;
  created_at: number;
  updated_at: number;
}

export interface ISharedRoomMessage {
  id: string;
  room_id: string;
  sender_type: 'user' | 'leader' | 'system' | string;
  sender_team_id?: string | null;
  sender_label: string;
  reply_to_id?: string | null;
  content: string;
  attachments: IStagedRoomArtifact[];
  target_team_ids: string[];
  hop_index: number;
  model_latency_ms?: number;
  tool_latency_ms?: number;
  total_latency_ms?: number;
  created_at: number;
}

export type SharedRoomTaskStatus =
  | 'backlog'
  | 'todo'
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export interface ISharedRoomTask {
  id: string;
  room_id: string;
  from_team_id?: string | null;
  from_team_name?: string | null;
  to_team_id: string;
  to_team_name: string;
  title: string;
  description: string;
  status: SharedRoomTaskStatus | string;
  blocked_by: string[];
  artifacts: IStagedRoomArtifact[];
  result_summary?: string | null;
  created_at: number;
  updated_at: number;
}

export interface ICreateSharedRoomParams {
  name: string;
  description?: string;
  rules?: string;
  team_ids: string[];
  host_team_id?: string | null;
  max_hops?: number;
}

export interface IUpdateSharedRoomParams {
  id: string;
  name?: string;
  description?: string;
  rules?: string;
  team_ids?: string[];
  host_team_id?: string | null;
  max_hops?: number;
}

export interface ISendSharedRoomMessageParams {
  id: string;
  content: string;
  mentions?: string[];
  files?: string[];
  reply_to_id?: string | null;
  wake_targets?: string[];
  live_steering?: boolean;
}

export interface ISendSharedRoomMessageResult {
  message: ISharedRoomMessage;
  routed_targets: IRoutedTarget[];
}

export interface ICreateSharedRoomTaskParams {
  room_id: string;
  to_team_id: string;
  title: string;
  description?: string;
  from_team_id?: string | null;
  blocked_by?: string[];
  files?: string[];
}

export interface IUpdateSharedRoomTaskParams {
  room_id: string;
  task_id: string;
  status?: SharedRoomTaskStatus | string;
  description?: string;
  result_summary?: string;
  files?: string[];
}

export interface IUpsertRoomTelegramBindingParams {
  id: string;
  group_chat_id?: string | null;
  group_thread_id?: string | null;
  set_active_dm_target?: boolean;
}

export interface ISharedRoomCreatedEvent {
  user_id: string;
  room: ISharedRoom;
}

export interface ISharedRoomUpdatedEvent {
  user_id: string;
  room: ISharedRoom;
}

export interface ISharedRoomRemovedEvent {
  user_id: string;
  room_id: string;
}

export interface ISharedRoomMessageCreatedEvent {
  user_id: string;
  room_id: string;
  message: ISharedRoomMessage;
  room?: ISharedRoom;
  hop_limit_reached?: boolean;
}

export interface ISharedRoomTaskChangedEvent {
  user_id: string;
  room_id: string;
  task: ISharedRoomTask;
}
