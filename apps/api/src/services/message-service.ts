import { generateId, extractTimestamp } from '@strata/snowflake';
import { parseMarkdown } from '@strata/markdown';

export interface MessageEntity {
  id: string; // Snowflake
  channelId: string;
  authorId: string;
  content: string;
  nonce?: string | null;
  editedAt?: Date | null;
  refMessageId?: string | null;
  pinned: boolean;
  mentionUsers: string[];
  mentionEveryone: boolean;
  reactions: Map<string, Set<string>>; // emoji -> Set of userIds
  createdAt: Date;
}

export interface AttachmentItem {
  id: string;
  filename: string;
  size: number;
  url: string;
  contentType: string;
}

export interface SendMessageParams {
  channelId: string;
  authorId: string;
  content: string;
  nonce?: string | null;
  messageReferenceId?: string | null;
  canMentionEveryone?: boolean;
  slowmodeSeconds?: number;
  isModerator?: boolean;
}

const BUCKET_DURATION_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

export function getMessageBucket(timestampMs: number): number {
  return Math.floor(timestampMs / BUCKET_DURATION_MS);
}

export class MessageService {
  // ScyllaDB in-memory partition simulation: Map<channelId, Map<bucket, MessageEntity[]>>
  private messagesByChannel = new Map<string, MessageEntity[]>();
  // Idempotency: Map<`${userId}:${nonce}`, MessageEntity>
  private nonceCache = new Map<string, { message: MessageEntity; expiresAt: number }>();
  // Slowmode: Map<`${channelId}:${userId}`, number> (timestamp of last sent message)
  private slowmodeTracker = new Map<string, number>();
  // Read state: Map<`${channelId}:${userId}`, string> (last read message ID)
  private readStates = new Map<string, string>();
  // Typing: Map<channelId, Map<userId, number>>
  private typingUsers = new Map<string, Map<string, number>>();

  /**
   * Sends a message with Nonce Idempotency & Slowmode checks.
   */
  public async sendMessage(params: SendMessageParams): Promise<{ message: MessageEntity; duplicate: boolean }> {
    // 1. NONCE IDEMPOTENCY CHECK
    if (params.nonce) {
      const nonceKey = `${params.authorId}:${params.nonce}`;
      const cached = this.nonceCache.get(nonceKey);
      if (cached && Date.now() < cached.expiresAt) {
        // Return existing message without duplicating!
        return { message: cached.message, duplicate: true };
      }
    }

    // 2. SLOWMODE CHECK
    if (params.slowmodeSeconds && params.slowmodeSeconds > 0 && !params.isModerator) {
      const slowmodeKey = `${params.channelId}:${params.authorId}`;
      const lastSent = this.slowmodeTracker.get(slowmodeKey) || 0;
      const elapsedSeconds = (Date.now() - lastSent) / 1000;
      if (elapsedSeconds < params.slowmodeSeconds) {
        const retryAfter = Math.ceil(params.slowmodeSeconds - elapsedSeconds);
        throw new Error(`Yavaş mod aktif. Lütfen ${retryAfter} saniye sonra tekrar deneyin.`);
      }
      this.slowmodeTracker.set(slowmodeKey, Date.now());
    }

    // 3. Parse AST for mentions
    const ast = parseMarkdown(params.content);
    const mentionUsers: string[] = [];
    let mentionEveryone = false;

    for (const node of ast) {
      if (node.type === 'mention') {
        if (node.mentionType === 'user' && node.id) {
          mentionUsers.push(node.id);
        } else if (node.mentionType === 'everyone') {
          mentionEveryone = Boolean(params.canMentionEveryone);
        }
      }
    }

    const messageId = generateId();
    const message: MessageEntity = {
      id: messageId,
      channelId: params.channelId,
      authorId: params.authorId,
      content: params.content,
      nonce: params.nonce || null,
      refMessageId: params.messageReferenceId || null,
      pinned: false,
      mentionUsers,
      mentionEveryone,
      reactions: new Map(),
      createdAt: new Date()
    };

    // Store message
    const channelMsgs = this.messagesByChannel.get(params.channelId) || [];
    channelMsgs.push(message);
    this.messagesByChannel.set(params.channelId, channelMsgs);

    // Save nonce for 60 seconds TTL
    if (params.nonce) {
      const nonceKey = `${params.authorId}:${params.nonce}`;
      this.nonceCache.set(nonceKey, {
        message,
        expiresAt: Date.now() + 60_000
      });
    }

    return { message, duplicate: false };
  }

  public getMessage(channelId: string, messageId: string): MessageEntity | null {
    const channelMsgs = this.messagesByChannel.get(channelId) || [];
    return channelMsgs.find((m) => m.id === messageId) || null;
  }

  public async editMessage(
    channelId: string,
    messageId: string,
    userId: string,
    newContent: string
  ): Promise<MessageEntity> {
    const msg = this.getMessage(channelId, messageId);
    if (!msg) throw new Error('Mesaj bulunamadı.');
    if (msg.authorId !== userId) throw new Error('Yalnızca kendi mesajınızı düzenleyebilirsiniz.');

    msg.content = newContent;
    msg.editedAt = new Date();
    return msg;
  }

  public async deleteMessage(
    channelId: string,
    messageId: string,
    userId: string,
    canManageMessages: boolean = false
  ): Promise<void> {
    const channelMsgs = this.messagesByChannel.get(channelId) || [];
    const index = channelMsgs.findIndex((m) => m.id === messageId);
    if (index === -1) throw new Error('Mesaj bulunamadı.');

    const msg = channelMsgs[index]!;
    if (msg.authorId !== userId && !canManageMessages) {
      throw new Error('Bu mesajı silme yetkiniz yok.');
    }

    channelMsgs.splice(index, 1);
    this.messagesByChannel.set(channelId, channelMsgs);
  }

  public async bulkDelete(
    channelId: string,
    messageIds: string[],
    canManageMessages: boolean
  ): Promise<number> {
    if (!canManageMessages) throw new Error('Toplu mesaj silme yetkiniz yok.');
    if (messageIds.length > 100) throw new Error('Tek seferde en fazla 100 mesaj silinebilir.');

    const channelMsgs = this.messagesByChannel.get(channelId) || [];
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    this.messagesByChannel.set(
      channelId,
      channelMsgs.filter((m) => {
        if (messageIds.includes(m.id)) {
          const timestamp = extractTimestamp(m.id);
          if (timestamp >= fourteenDaysAgo) {
            deletedCount++;
            return false;
          }
        }
        return true;
      })
    );

    return deletedCount;
  }

  public getMessages(
    channelId: string,
    params: { before?: string; after?: string; limit?: number } = {}
  ): MessageEntity[] {
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    let msgs = [...(this.messagesByChannel.get(channelId) || [])];

    // Sort descending by Snowflake ID (newest first)
    msgs.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));

    if (params.before) {
      const beforeId = BigInt(params.before);
      msgs = msgs.filter((m) => BigInt(m.id) < beforeId);
    } else if (params.after) {
      const afterId = BigInt(params.after);
      msgs = msgs.filter((m) => BigInt(m.id) > afterId);
    }

    return msgs.slice(0, limit);
  }

  public addReaction(channelId: string, messageId: string, userId: string, emoji: string): void {
    const msg = this.getMessage(channelId, messageId);
    if (!msg) throw new Error('Mesaj bulunamadı.');

    let userSet = msg.reactions.get(emoji);
    if (!userSet) {
      userSet = new Set();
      msg.reactions.set(emoji, userSet);
    }
    userSet.add(userId);
  }

  public removeReaction(channelId: string, messageId: string, userId: string, emoji: string): void {
    const msg = this.getMessage(channelId, messageId);
    if (!msg) return;

    const userSet = msg.reactions.get(emoji);
    if (userSet) {
      userSet.delete(userId);
      if (userSet.size === 0) {
        msg.reactions.delete(emoji);
      }
    }
  }

  public pinMessage(channelId: string, messageId: string): void {
    const msg = this.getMessage(channelId, messageId);
    if (!msg) throw new Error('Mesaj bulunamadı.');
    msg.pinned = true;
  }

  public unpinMessage(channelId: string, messageId: string): void {
    const msg = this.getMessage(channelId, messageId);
    if (!msg) throw new Error('Mesaj bulunamadı.');
    msg.pinned = false;
  }

  public getPins(channelId: string): MessageEntity[] {
    const channelMsgs = this.messagesByChannel.get(channelId) || [];
    return channelMsgs.filter((m) => m.pinned);
  }

  public ackMessage(channelId: string, userId: string, messageId: string): void {
    this.readStates.set(`${channelId}:${userId}`, messageId);
  }

  public getReadState(channelId: string, userId: string): string | null {
    return this.readStates.get(`${channelId}:${userId}`) || null;
  }

  public triggerTyping(channelId: string, userId: string): void {
    let map = this.typingUsers.get(channelId);
    if (!map) {
      map = new Map();
      this.typingUsers.set(channelId, map);
    }
    map.set(userId, Date.now());
  }

  public getTypingUsers(channelId: string): string[] {
    const map = this.typingUsers.get(channelId);
    if (!map) return [];
    const now = Date.now();
    const active: string[] = [];
    for (const [userId, timestamp] of map.entries()) {
      if (now - timestamp < 10_000) {
        active.push(userId);
      } else {
        map.delete(userId);
      }
    }
    return active;
  }
}
