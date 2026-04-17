// ─── ManyChat integration interface ──────────────────────────────────────────

export interface SendDMParams {
  /** ManyChat subscriber ID */
  subscriberId: string;
  message: string;
  /** Optional button actions */
  buttons?: Array<{ title: string; url: string }>;
}

export interface TriggerFlowParams {
  subscriberId: string;
  flowNs: string;
}

export interface TagSubscriberParams {
  subscriberId: string;
  tagName: string;
}

export interface CommentTrigger {
  platform: "INSTAGRAM" | "FACEBOOK";
  postId: string;
  keyword: string;
  /** Flow namespace to trigger when keyword is matched */
  flowNs: string;
  /** Whether to also send a DM reply */
  sendDM: boolean;
  dmMessage?: string;
}

export interface IManyChatService {
  sendDM(params: SendDMParams): Promise<void>;
  triggerFlow(params: TriggerFlowParams): Promise<void>;
  tagSubscriber(params: TagSubscriberParams): Promise<void>;
  setupCommentTrigger(trigger: CommentTrigger): Promise<{ triggerId: string }>;
}
