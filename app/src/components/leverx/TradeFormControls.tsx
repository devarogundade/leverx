import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { segTab, segTabsClass, tradeInputCard, inputInField } from "@/lib/leverx/tw";
import { cn } from "@/lib/utils";

interface TradeAmountInputProps extends Omit<ComponentProps<typeof Input>, "size" | "prefix"> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  large?: boolean;
  wrapperClassName?: string;
}

export function TradeAmountInput({
  prefix,
  suffix,
  large,
  wrapperClassName,
  className,
  ...props
}: TradeAmountInputProps) {
  return (
    <div className={cn(tradeInputCard, "flex items-center gap-2 px-4 py-3", wrapperClassName)}>
      {prefix ? <span className="shrink-0 text-muted-foreground">{prefix}</span> : null}
      <Input
        className={cn(
          inputInField,
          "font-mono",
          large ? "text-2xl font-light sm:text-3xl" : "text-sm",
          className,
        )}
        {...props}
      />
      {suffix}
    </div>
  );
}

interface TradeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  size?: "sm" | "default";
  className?: string;
  triggerClassName?: string;
}

export function TradeSelect({
  value,
  onValueChange,
  options,
  placeholder,
  size = "default",
  className,
  triggerClassName,
}: TradeSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(
          "border-border bg-card",
          size === "sm" && "h-7 min-h-7 text-xs",
          triggerClassName,
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TradeChipGroupProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  className?: string;
}

export function TradeChipGroup<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: TradeChipGroupProps<T>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn(segTabsClass("stretch"), className)}
    >
      {options.map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={opt.value}
          className={cn(
            segTab,
            "h-auto min-h-0 flex-1 rounded-none px-2 py-1.5 text-xs font-medium text-muted-foreground",
            "data-[state=on]:text-foreground",
          )}
        >
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

interface TradeQuickAmountsProps {
  amounts: readonly { label: string; value: string }[];
  onPick: (value: string) => void;
  className?: string;
}

export function TradeQuickAmounts({ amounts, onPick, className }: TradeQuickAmountsProps) {
  return (
    <div className={cn("grid grid-cols-5 gap-1", className)}>
      {amounts.map((a) => (
        <Button
          key={a.label}
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-10 rounded-md px-0 text-xs font-medium text-muted-foreground hover:bg-hover hover:text-foreground sm:min-h-8"
          onClick={() => onPick(a.value)}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}
