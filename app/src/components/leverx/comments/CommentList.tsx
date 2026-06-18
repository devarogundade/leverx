import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageCircle } from "lucide-react";
import { JazziconAvatar } from "@/components/leverx/comments/JazziconAvatar";
import { CommentComposer } from "@/components/leverx/comments/CommentComposer";
import { shortAddress } from "@/components/leverx/CopyField";
import { renderCommentText } from "@/lib/comments/render-comment-text";
import type { MarketComment } from "@/lib/comments/types";
import { cn } from "@/lib/utils";

function formatCommentTime(timestamp: MarketComment["timestamp"]): string {
  if (!timestamp?.toDate) return "just now";
  return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
}

interface CommentItemProps {
  comment: MarketComment;
  address: string | null;
  onToggleLike: (commentId: string, liked: boolean) => Promise<void>;
  onReply: (commentId: string, text: string) => Promise<void>;
}

function CommentItem({ comment, address, onToggleLike, onReply }: CommentItemProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyPosting, setReplyPosting] = useState(false);
  const liked = address ? comment.likes.includes(address) : false;

  return (
    <article className="flex gap-3">
      <JazziconAvatar address={comment.address} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-xs text-foreground">{shortAddress(comment.address, 6, 4)}</span>
          <span className="text-xs text-muted-foreground">{formatCommentTime(comment.timestamp)}</span>
        </div>
        <div className="mt-1 text-sm text-foreground">{renderCommentText(comment.text)}</div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground",
              liked && "text-rose-400",
            )}
            disabled={!address}
            onClick={() => void onToggleLike(comment.id, liked)}
          >
            <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} />
            {comment.likes.length > 0 ? comment.likes.length : null}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            disabled={!address}
            onClick={() => setReplyOpen((open) => !open)}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Reply
          </button>
        </div>

        {comment.replies.length > 0 ? (
          <div className="mt-3 space-y-3 border-l border-border/60 pl-3">
            {comment.replies.map((reply) => (
                <div key={reply.id} className="flex gap-2.5">
                  <JazziconAvatar address={reply.address} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-xs text-foreground">
                        {shortAddress(reply.address, 6, 4)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatCommentTime(reply.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-foreground">{renderCommentText(reply.text)}</div>
                    {reply.likes.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{reply.likes.length} likes</p>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>
        ) : null}

        {replyOpen ? (
          <div className="mt-3">
            <CommentComposer
              address={address}
              compact
              posting={replyPosting}
              placeholder="Write a reply…"
              onSubmit={async (text) => {
                setReplyPosting(true);
                try {
                  await onReply(comment.id, text);
                  setReplyOpen(false);
                } finally {
                  setReplyPosting(false);
                }
              }}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

interface Props {
  comments: MarketComment[];
  address: string | null;
  onToggleLike: (commentId: string, liked: boolean) => Promise<void>;
  onReply: (commentId: string, text: string) => Promise<void>;
}

export function CommentList({ comments, address, onToggleLike, onReply }: Props) {
  if (comments.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No comments yet. Start the conversation.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          address={address}
          onToggleLike={onToggleLike}
          onReply={onReply}
        />
      ))}
    </div>
  );
}
