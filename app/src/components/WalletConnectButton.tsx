import { type ReactNode, useState } from "react";
import { ChevronDown, Copy, Loader2, LogOut, Wallet as WalletIcon } from "lucide-react";
import type { WalletWithRequiredFeatures } from "@mysten/wallet-standard";
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
import {
  formatSuiAddress,
  getGoogleEnokiWallet,
  isGoogleEnokiWallet,
} from "@/lib/sui/wallets";
import { isEnokiGoogleLoginEnabled } from "@/lib/config";
import { showError, showTxSuccess } from "@/lib/toast";

interface Props {
  className?: string;
  fullWidth?: boolean;
  large?: boolean;
  /** Shorter label and tighter padding for the site header on small screens */
  compact?: boolean;
  onMenuClose?: () => void;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function WalletConnectButton({
  className,
  fullWidth,
  large,
  compact,
  onMenuClose,
}: Props) {
  const { wallet, wallets, address, connecting, connect, disconnect, refreshWallets } =
    useWallet();
  const [open, setOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const loginEnabled = isEnokiGoogleLoginEnabled();

  const externalWallets = wallets.filter((w) => !isGoogleEnokiWallet(w));
  const connectedIsGoogle = wallet ? isGoogleEnokiWallet(wallet) : false;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) refreshWallets();
  };

  const handleChooserOpenChange = (next: boolean) => {
    setChooserOpen(next);
    if (next) refreshWallets();
  };

  const handleGoogleLogin = async () => {
    onMenuClose?.();
    setChooserOpen(false);
    refreshWallets();
    const googleWallet = getGoogleEnokiWallet();
    if (!googleWallet) {
      showError(
        loginEnabled
          ? "Google sign-in is not ready yet. Try again in a moment."
          : "Google sign-in is not configured.",
      );
      return;
    }
    await connect(googleWallet);
  };

  const handleConnectWallet = async (target: WalletWithRequiredFeatures) => {
    onMenuClose?.();
    setChooserOpen(false);
    await connect(target);
  };

  type ConnectOption = {
    id: string;
    label: ReactNode;
    icon: ReactNode;
    onSelect: () => void | Promise<void>;
  };

  const options: ConnectOption[] = [];
  if (loginEnabled) {
    options.push({
      id: "google",
      label: "Sign in with Google",
      icon: <GoogleIcon className="h-4 w-4 shrink-0 opacity-90" />,
      onSelect: handleGoogleLogin,
    });
  }
  for (const w of externalWallets) {
    options.push({
      id: w.name,
      label: w.name,
      icon: w.icon ? (
        <img src={w.icon} alt="" className="h-4 w-4 shrink-0 rounded-full" />
      ) : (
        <WalletIcon className="h-4 w-4 shrink-0 opacity-90" />
      ),
      onSelect: () => handleConnectWallet(w),
    });
  }

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
              {wallet.icon ? (
                <img src={wallet.icon} alt="" className="h-4 w-4 shrink-0 rounded-full" />
              ) : (
                <GoogleIcon className="h-4 w-4 shrink-0 opacity-80" />
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
            {connectedIsGoogle ? "Signed in with Google" : `Connected · ${wallet.name}`}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                showTxSuccess("Wallet address copied");
              } catch {
                showError("Could not copy address");
              }
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy wallet address
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              onMenuClose?.();
              void disconnect();
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const loginLabel = compact ? (
    <>
      <span className="sm:hidden">Login</span>
      <span className="hidden sm:inline">Sign in with Google</span>
    </>
  ) : (
    "Sign in with Google"
  );

  const connectLabel = compact ? (
    <>
      <span className="sm:hidden">Connect</span>
      <span className="hidden sm:inline">Connect wallet</span>
    </>
  ) : (
    "Connect wallet"
  );

  const buttonClasses = cn(
    "btn-connect gap-2",
    compact && "btn-connect--compact",
    fullWidth && "w-full",
    large && "btn-connect-lg",
    className,
  );

  const unavailableHint = import.meta.env.DEV
    ? "Install a Sui wallet, or set VITE_ENOKI_API_KEY and VITE_ENOKI_GOOGLE_CLIENT_ID in .env"
    : "No wallet available. Install a Sui wallet to continue.";

  // Nothing to connect with: no Google sign-in configured and no installed wallets.
  if (options.length === 0) {
    return (
      <div className={cn("flex flex-col gap-1", fullWidth && "w-full")}>
        <Button
          type="button"
          variant="ghost"
          disabled
          title={unavailableHint}
          className={buttonClasses}
        >
          <WalletIcon className="h-4 w-4 shrink-0 opacity-90" />
          {connectLabel}
        </Button>
        {fullWidth ? (
          <p className="text-center text-xs leading-snug text-muted-foreground">
            {unavailableHint}
          </p>
        ) : null}
      </div>
    );
  }

  // A single option (typically just Google): connect directly without a chooser.
  if (options.length === 1) {
    const only = options[0]!;
    const isGoogle = only.id === "google";
    return (
      <div className={cn("flex flex-col gap-1", fullWidth && "w-full")}>
        <Button
          type="button"
          variant="ghost"
          disabled={connecting}
          onClick={() => void only.onSelect()}
          className={buttonClasses}
        >
          {connecting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className={cn(compact && "hidden sm:inline")}>
                {isGoogle ? "Signing in…" : "Connecting…"}
              </span>
            </>
          ) : (
            <>
              {only.icon}
              {isGoogle ? loginLabel : <span className="truncate">Connect {only.label}</span>}
            </>
          )}
        </Button>
      </div>
    );
  }

  // Multiple options: let the user choose Google or an installed wallet.
  return (
    <DropdownMenu open={chooserOpen} onOpenChange={handleChooserOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" disabled={connecting} className={buttonClasses}>
          {connecting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className={cn(compact && "hidden sm:inline")}>Connecting…</span>
            </>
          ) : (
            <>
              <WalletIcon className="h-4 w-4 shrink-0 opacity-90" />
              {connectLabel}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
                  compact && "hidden sm:block",
                  chooserOpen && "rotate-180",
                )}
              />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(
          "min-w-[14rem]",
          fullWidth && "w-[var(--radix-dropdown-menu-trigger-width)]",
        )}
      >
        <DropdownMenuLabel className="text-sm font-normal text-muted-foreground">
          Choose how to connect
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt) => (
          <DropdownMenuItem key={opt.id} className="gap-2" onClick={() => void opt.onSelect()}>
            {opt.icon}
            <span className="truncate">
              {opt.id === "google" ? "Sign in with Google" : opt.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
