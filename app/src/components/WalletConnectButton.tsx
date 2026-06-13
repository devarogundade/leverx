import { useState } from "react";
import { ChevronDown, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWallet } from "@/context/WalletContext";
import { formatSuiAddress } from "@/lib/sui/wallets";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";

interface Props {
  className?: string;
  fullWidth?: boolean;
  large?: boolean;
  /** Shorter label and tighter padding for the site header on small screens */
  compact?: boolean;
  onMenuClose?: () => void;
}

export function WalletConnectButton({
  className,
  fullWidth,
  large,
  compact,
  onMenuClose,
}: Props) {
  const { wallets, wallet, address, connecting, connect, disconnect, refreshWallets } =
    useWallet();
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) refreshWallets();
  };

  const handlePick = async (w: WalletWithRequiredFeatures) => {
    setOpen(false);
    onMenuClose?.();
    await connect(w);
  };

  if (address && wallet) {
    return (
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "btn-connect gap-2 text-sm",
              compact && "btn-connect--compact",
              fullWidth && "w-full justify-between",
              large && "btn-connect-lg",
              className,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {wallet.icon && (
                <img src={wallet.icon} alt="" className="h-4 w-4 shrink-0 rounded-full" />
              )}
              <span className={cn("truncate", compact && "max-w-[4.25rem] sm:max-w-none")}>
                {formatSuiAddress(address)}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
                compact && "hidden sm:block",
                open && "rotate-180",
              )}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className={cn("min-w-[12rem]", fullWidth && "w-[var(--radix-dropdown-menu-trigger-width)]")}
        >
          <DropdownMenuLabel className="text-sm font-normal text-muted-foreground">
            {wallet.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              onMenuClose?.();
              void disconnect();
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={connecting}
          className={cn(
            "btn-connect",
            compact && "btn-connect--compact",
            fullWidth && "w-full",
            large && "btn-connect-lg",
            className,
          )}
        >
          {connecting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className={cn(compact && "hidden sm:inline")}>Connecting…</span>
            </>
          ) : compact ? (
            <>
              <span className="sm:hidden">Connect</span>
              <span className="hidden sm:inline">Connect Wallet</span>
            </>
          ) : (
            "Connect Wallet"
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("w-56", fullWidth && "w-[var(--radix-dropdown-menu-trigger-width)]")}
      >
        {wallets.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm leading-relaxed text-muted-foreground">
            No Sui wallet detected. Install{" "}
            <a
              href="https://suiwallet.com/"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              Sui Wallet
            </a>{" "}
            or another Wallet Standard extension, then refresh.
          </p>
        ) : (
          wallets.map((w) => (
            <DropdownMenuItem key={w.name} onClick={() => void handlePick(w)}>
              {w.icon ? (
                <img src={w.icon} alt="" className="h-6 w-6 rounded-md" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-[10px] font-semibold">
                  {w.name.slice(0, 1)}
                </span>
              )}
              <span className="font-medium">{w.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
