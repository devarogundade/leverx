import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "h-7 w-7 sm:h-8 sm:w-8",
  md: "h-11 w-11",
  lg: "h-14 w-14",
} as const;

interface Props {
  className?: string;
  size?: keyof typeof SIZE_CLASS;
}

export function AppLogo({ className, size = "sm" }: Props) {
  return (
    <img
      src={logo}
      alt="LeverX"
      width={32}
      height={32}
      className={cn("shrink-0 rounded-md object-cover", SIZE_CLASS[size], className)}
    />
  );
}
