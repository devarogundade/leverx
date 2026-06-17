/** Human-readable hint from Sui devInspect Move abort strings. */
export function describeMoveAbort(error: string): string | null {
  const code = error.match(/sub_status: Some\((\d+)\)/)?.[1];
  if (!code) return null;

  switch (code) {
    case '7':
      if (error.includes('borrow_flash_liquidity')) {
        return 'vault idle liquidity too low for flash loan';
      }
      return 'insufficient vault liquidity';
    case '18':
      return 'position not liquidatable on-chain';
    case '21':
      return 'redeem proceeds do not cover vault debt';
    case '26':
      return 'redeem slippage exceeded — market moved before execution';
    default:
      return `Move abort ${code}`;
  }
}
