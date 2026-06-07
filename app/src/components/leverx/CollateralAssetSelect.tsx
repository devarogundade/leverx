import { AssetBadge } from "@/components/AssetBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { quoteAssetSymbol } from "@/lib/predict/quote-assets";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  assets: readonly string[];
  className?: string;
  disabled?: boolean;
}

function AssetOption({ coinType }: { coinType: string }) {
  const symbol = quoteAssetSymbol(coinType);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <AssetBadge asset={symbol} size="sm" />
      <span className="truncate font-medium">{symbol}</span>
    </span>
  );
}

export function CollateralAssetSelect({ value, onValueChange, assets, className, disabled }: Props) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || assets.length === 0}>
      <SelectTrigger className={cn("collateral-asset-select w-full", className)}>
        <SelectValue placeholder="Select collateral" />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[var(--radix-select-trigger-width)]">
        {assets.map((coinType) => (
          <SelectItem key={coinType} value={coinType}>
            <AssetOption coinType={coinType} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
