import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pillIconBtn, pillToggleIdle } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";
import { Smile } from "lucide-react";

interface Props {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPickerPopover({ onSelect, disabled }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(pillIconBtn, pillToggleIdle, "h-8 w-8 rounded-md p-0")}
          aria-label="Add emoji"
          disabled={disabled}
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-auto border-border/80 bg-[#1a1a1a] p-0 shadow-xl"
      >
        <EmojiPicker
          theme={Theme.DARK}
          searchPlaceholder="Search emoji"
          width={320}
          height={360}
          lazyLoadEmojis
          onEmojiClick={(data: EmojiClickData) => onSelect(data.emoji)}
          previewConfig={{ showPreview: false }}
        />
      </PopoverContent>
    </Popover>
  );
}
