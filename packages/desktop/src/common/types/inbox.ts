/**
 * Action Inbox DTOs and Types for Milestone 4 (F22)
 */

export interface ActionInboxCardDto {
  id: string;
  category: 'worktree_merge' | 'multiple_choice' | 'budget_warning' | 'max_hops' | string;
  title: string;
  summary: string;
  details: Record<string, any>;
  status: 'pending' | 'resolved' | 'dismissed';
  target_type: string;
  target_id: string;
  action_token?: string;
  telegram_chat_id?: string;
  telegram_msg_id?: string;
  resolution_result?: string;
  resolved_by?: 'desktop' | 'telegram' | string;
  resolved_at?: number;
  created_at: number;
  updated_at: number;
}

export interface ActionInboxListResponse {
  items: ActionInboxCardDto[];
  pending_count: number;
}

export interface ResolveActionInboxRequest {
  action: 'approve' | 'reject' | 'choice' | string;
  payload?: any;
}

export interface ResolveActionInboxResponse {
  success: boolean;
  resolved_at: number;
}

export interface ActionInboxItemAddedEvent {
  item: ActionInboxCardDto;
}

export interface ActionInboxItemResolvedEvent {
  id: string;
  resolved_by: 'desktop' | 'telegram' | string;
}
