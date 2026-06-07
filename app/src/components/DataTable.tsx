import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { pageState } from "@/lib/leverx/tw";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  hideOnMobile?: boolean;
  mobileLabel?: string;
  mobileEmphasis?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
}

export function DataTable<T>({ columns, rows, rowKey, empty, onRowClick, rowClassName }: Props<T>) {
  if (rows.length === 0 && empty) {
    return (
      <div className={cn(pageState, "py-8")}>{empty}</div>
    );
  }

  return (
    <>
      <div className="data-table-wrap hidden overflow-x-auto overscroll-x-contain md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-4 py-3 text-left font-medium",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "transition-colors",
                  onRowClick && "cursor-pointer hover:bg-hover/50",
                  rowClassName?.(row),
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 align-middle",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => {
          const emphasis = columns.filter((c) => c.mobileEmphasis);
          const rest = columns.filter((c) => !c.mobileEmphasis && !c.hideOnMobile);
          return (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "rounded-lg border border-border bg-card/50 p-4",
                onRowClick && "cursor-pointer active:bg-hover/50",
                rowClassName?.(row),
              )}
            >
              {emphasis.length > 0 && (
                <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
                  {emphasis.map((c) => (
                    <div key={c.key} className={cn(c.align === "right" && "text-right")}>
                      {c.cell(row)}
                    </div>
                  ))}
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="flex flex-col gap-0.5">
                    <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      {c.mobileLabel ?? c.header}
                    </dt>
                    <dd className="text-sm text-foreground">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </>
  );
}
