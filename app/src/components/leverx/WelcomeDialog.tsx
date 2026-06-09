import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/brand";

const STORAGE_KEY = "leverx_welcome_dismissed";

export function WelcomeDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="welcome-dialog-hero">
          <div className="landing-grid-bg absolute inset-0 opacity-30" aria-hidden />
          <div className="relative z-10 flex items-center gap-3">
            <div className="landing-logo">LX</div>
            <span className="font-display text-xl font-bold tracking-tight">{APP_NAME}</span>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-lg tracking-tight">
              Welcome to {APP_NAME}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Bet on where prices go with dUSDC at fixed 1× leverage. Connect your wallet, pick a market, and
              open your first trade in minutes — all on the demo network.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="btn-connect flex-1 gap-1.5">
              <Link to="/markets" onClick={dismiss}>
                Get started
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1 gap-1.5">
              <Link to="/guide" onClick={dismiss}>
                <BookOpen className="h-3.5 w-3.5" />
                Learn more
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
