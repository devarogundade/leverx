import type { MouseEvent } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMarketFavorites } from "@/context/MarketFavoritesContext";
import { marketsBookmark } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface Props {
  marketId: string;
  className?: string;
  size?: "icon" | "sm";
  iconClassName?: string;
}

export function MarketFavoriteButton({
  marketId,
  className,
  size = "icon",
  iconClassName,
}: Props) {
  const { isFavorite, toggleFavorite } = useMarketFavorites();
  const active = isFavorite(marketId);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(marketId);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={cn(marketsBookmark, active && "text-accent", className)}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={active}
      onClick={handleClick}
    >
      <Bookmark
        className={cn("h-3.5 w-3.5", active && "fill-current", iconClassName)}
        aria-hidden
      />
    </Button>
  );
}
