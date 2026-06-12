import { toast } from "sonner";
import { formatTxError } from "@/lib/leverx/tx-errors";

export function showTxError(error: unknown) {
  toast.error(formatTxError(error));
}

export function showTxSuccess(message: string) {
  toast.success(message);
}

export function showError(message: string) {
  toast.error(message);
}
