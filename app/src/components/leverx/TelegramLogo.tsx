import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
} as const;

/** Telegram brand mark — paper plane on sky blue. */
export function TelegramLogo({ className, size = "md" }: Props) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        "bg-gradient-to-br from-[#37aee2] to-[#1e96c8]",
        "shadow-[0_2px_8px_-2px_color-mix(in_oklab,#229ED9_45%,transparent),0_1px_0_0_color-mix(in_oklab,white_25%,transparent)_inset]",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%] fill-white" role="img">
        <path d="M9.417 15.181-.363 8.677c-.155-1.103.37-1.548 1.321-1.286l12.056 4.509c1.252.488 1.243 1.179.227 1.572l-12.056 4.509c-.954.356-1.501-.064-1.237-1.17l1.588-5.731 9.6-5.431c.428-.241.821-.111.499.171l-7.761 6.666z" />
      </svg>
    </span>
  );
}
