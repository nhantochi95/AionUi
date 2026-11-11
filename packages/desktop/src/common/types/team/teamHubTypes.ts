/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ConnectedModelOptionDto {
  id: string;
  label: string;
}

export interface ConnectedCliEngineDto {
  engine_kind: 'cli';
  backend: string;
  agent_id: string;
  assistant_id: string;
  name: string;
  wallet_type: 'cli_subscription' | 'api_key';
  status: string;
  supports_native_compact: boolean;
  models: ConnectedModelOptionDto[];
}

export interface ConnectedApiProviderDto {
  engine_kind: 'api_provider';
  backend: 'aionrs';
  provider_id: string;
  provider_name: string;
  platform: string;
  assistant_id: string;
  wallet_type: 'api_key';
  models: ConnectedModelOptionDto[];
}

export interface ConnectedModelsCatalogDto {
  cli_agents: ConnectedCliEngineDto[];
  api_providers: ConnectedApiProviderDto[];
}

export interface ModelTargetSpec {
  backend: string;
  provider_id?: string;
  model_id: string;
  label?: string;
  wallet_type?: 'cli_subscription' | 'api_key';
}

export interface QuickCreateMemberRequest {
  name: string;
  role_prompt?: string;
  backend: string;
  provider_id?: string;
  model_id: string;
  save_to_catalog?: boolean;
  team_id?: string;
}

export interface QuickCreateMemberResponse {
  assistant_id: string;
  assistant_name: string;
  backend: string;
  provider_id?: string;
  model_id: string;
  wallet_type: 'cli_subscription' | 'api_key';
  added_agent?: unknown;
}

export interface SlotContextStatusDto {
  slot_id: string;
  name: string;
  role: string;
  conversation_id: string;
  backend: string;
  provider_id?: string;
  model_id: string;
  wallet_type: 'cli_subscription' | 'api_key';
  used_tokens: number;
  max_tokens: number;
  usage_percent: number;
  level: 'normal' | 'warning' | 'critical';
  compaction_count: number;
  auto_compact_enabled: boolean;
  has_anchored_summary: boolean;
  pending_model_swap?: {
    backend: string;
    provider_id?: string;
    model_id: string;
  };
  effective_compact_limit_tokens?: number;
  wakeup_turns?: number;
  input_tokens_total?: number;
  output_tokens_total?: number;
  cached_read_tokens_total?: number;
  estimated_cost_usd?: number;
  compaction_saved_tokens?: number;
}

export type TeamEconomyMode = 'lean' | 'balanced' | 'verbose';

export type TeamQuotaPreset = 'smart_split' | 'all_free_cli';

export interface TeamContextStatusResponse {
  team_id: string;
  auto_compact_enabled: boolean;
  auto_compact_threshold_pct: number;
  economy_mode?: TeamEconomyMode;
  max_context_tokens?: number;
  tokens_saved_estimate?: number;
  coalesced_wakes_saved?: number;
  max_turn_hops_per_run?: number;
  auto_fallback_free_cli?: boolean;
  total_wakeup_turns?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cached_read_tokens?: number;
  total_estimated_cost_usd?: number;
  slots: SlotContextStatusDto[];
}

export interface TeamContextUsageEvent {
  user_id?: string;
  team_id: string;
  auto_compact_enabled: boolean;
  auto_compact_threshold_pct?: number;
  economy_mode?: TeamEconomyMode;
  max_context_tokens?: number;
  tokens_saved_estimate?: number;
  coalesced_wakes_saved?: number;
  max_turn_hops_per_run?: number;
  auto_fallback_free_cli?: boolean;
  total_wakeup_turns?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cached_read_tokens?: number;
  total_estimated_cost_usd?: number;
  slots: SlotContextStatusDto[];
}

export interface CompactSlotOutcomeDto {
  slot_id: string;
  name: string;
  strategy_used: 'native_compact' | 'anchored_rollover' | 'queued_after_turn' | 'settings_only';
  previous_tokens: number;
  new_tokens: number;
  anchored_summary_preview?: string;
}

export interface CompactTeamContextRequest {
  team_id: string;
  slot_id?: string;
  mode?: 'auto' | 'rollover' | 'native' | 'prefs_only';
  auto_compact_enabled?: boolean;
  economy_mode?: TeamEconomyMode;
  max_context_tokens?: number;
  force_interrupt?: boolean;
}

export interface CompactTeamContextResponse {
  team_id: string;
  auto_compact_enabled: boolean;
  economy_mode?: TeamEconomyMode;
  max_context_tokens?: number;
  tokens_saved_estimate?: number;
  coalesced_wakes_saved?: number;
  outcomes: CompactSlotOutcomeDto[];
}

export interface PerSlotModelUpdate {
  slot_id: string;
  target: ModelTargetSpec;
}

export interface ApplyTeamQuotaPresetRequest {
  team_id: string;
  preset: TeamQuotaPreset;
  force_interrupt?: boolean;
}

export interface SwitchTeamModelsRequest {
  team_id: string;
  scope?: 'all' | 'teammates_only' | 'slots';
  preset?: TeamQuotaPreset;
  target?: ModelTargetSpec;
  updates?: PerSlotModelUpdate[];
  force_interrupt?: boolean;
}

export interface SwitchSlotModelOutcomeDto {
  slot_id: string;
  name: string;
  role: string;
  previous_backend: string;
  previous_model: string;
  new_backend: string;
  new_provider_id?: string;
  new_model: string;
  wallet_type: 'cli_subscription' | 'api_key';
  status: 'applied' | 'queued_after_turn';
  handover_injected: boolean;
}

export interface SwitchTeamModelsResponse {
  team_id: string;
  outcomes: SwitchSlotModelOutcomeDto[];
}
