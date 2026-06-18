import { MessageSquare } from "lucide-react";
import { CommentComposer } from "@/components/leverx/comments/CommentComposer";
import { CommentList } from "@/components/leverx/comments/CommentList";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import type { useMarketComments } from "@/hooks/useMarketComments";
import { isFirebaseConfigured } from "@/lib/firebase";
import { showTxError } from "@/lib/toast";

type CommentsState = ReturnType<typeof useMarketComments>;

interface Props {
  address: string | null;
  commentsState: CommentsState;
}

export function MarketCommentsPanel({ address, commentsState }: Props) {
  const {
    comments,
    loading,
    error,
    posting,
    postComment,
    toggleLike,
    postReply,
    loadMore,
    hasMore,
  } = commentsState;

  if (!isFirebaseConfigured()) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Comments unavailable"
        description="Firebase is not configured for this environment."
        compact
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <CommentComposer
        address={address}
        posting={posting}
        onSubmit={async (text) => {
          if (!address) return;
          try {
            await postComment(address, text);
          } catch (err) {
            showTxError(err instanceof Error ? err.message : "Failed to post comment.");
          }
        }}
      />

      {loading ? <LoadingState label="Loading comments…" compact /> : null}
      {!loading && error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}

      {!loading && !error ? (
        <>
          <CommentList
            comments={comments}
            address={address}
            onToggleLike={async (commentId, liked) => {
              if (!address) return;
              try {
                await toggleLike(commentId, address, liked);
              } catch (err) {
                showTxError(err instanceof Error ? err.message : "Failed to update like.");
              }
            }}
            onReply={async (commentId, text) => {
              if (!address) return;
              try {
                await postReply(commentId, address, text);
              } catch (err) {
                showTxError(err instanceof Error ? err.message : "Failed to post reply.");
              }
            }}
          />
          {hasMore ? (
            <button
              type="button"
              className="mx-auto block text-sm font-medium text-primary hover:underline"
              onClick={loadMore}
            >
              Show more comments
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
