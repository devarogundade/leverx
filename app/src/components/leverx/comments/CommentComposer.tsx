import { useState } from "react";
import { EmojiPickerPopover } from "@/components/leverx/comments/EmojiPickerPopover";
import { GifPickerPopover } from "@/components/leverx/comments/GifPickerPopover";
import { appendToCommentText } from "@/lib/comments/render-comment-text";
import { cn } from "@/lib/utils";

interface Props {
  address: string | null;
  posting?: boolean;
  onSubmit: (text: string) => Promise<void>;
  placeholder?: string;
  compact?: boolean;
}

export function CommentComposer({
  address,
  posting = false,
  onSubmit,
  placeholder = "Share your thoughts…",
  compact = false,
}: Props) {
  const [text, setText] = useState("");

  const canPost = Boolean(address && text.trim() && !posting);

  return (
    <div className={cn("rounded-lg border border-border/80 bg-muted/20 p-3", compact && "p-2.5")}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={address ? placeholder : "Sign in to comment"}
        disabled={!address || posting}
        rows={compact ? 1 : 2}
        className={cn(
          "w-full resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground",
          compact ? "min-h-[36px]" : "min-h-[44px]",
        )}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <EmojiPickerPopover
            disabled={!address || posting}
            onSelect={(emoji) => setText((current) => appendToCommentText(current, emoji))}
          />
          <GifPickerPopover
            disabled={!address || posting}
            onSelect={(gifUrl) => setText((current) => appendToCommentText(current, gifUrl))}
          />
        </div>
        <button
          type="button"
          disabled={!canPost}
          onClick={async () => {
            const next = text.trim();
            if (!next) return;
            await onSubmit(next);
            setText("");
          }}
          className={cn(
            "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity",
            !canPost && "cursor-not-allowed opacity-50",
          )}
        >
          {posting ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}
