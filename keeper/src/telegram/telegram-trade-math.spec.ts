import {
  formatLeverageMultiplier,
  formatLeverageTimeCapWarning,
  formatSlippagePercent,
  parseSlippagePercent,
  parseTelegramTradeCommand,
  percentToBps,
} from './telegram-trade-math';

describe('formatLeverageMultiplier', () => {
  it('formats whole and fractional multipliers', () => {
    expect(formatLeverageMultiplier(1)).toBe('1x');
    expect(formatLeverageMultiplier(4)).toBe('4x');
    expect(formatLeverageMultiplier(2.5)).toBe('2.5x');
  });
});

describe('formatLeverageTimeCapWarning', () => {
  it('describes the current cap when no request is given', () => {
    expect(formatLeverageTimeCapWarning(3)).toContain('3x');
  });

  it('warns when requested leverage exceeds the cap', () => {
    const message = formatLeverageTimeCapWarning(2, 5);
    expect(message).toContain('5x');
    expect(message).toContain('max 2x');
  });
});

describe('parseSlippagePercent', () => {
  it('accepts percent with or without a suffix', () => {
    expect(parseSlippagePercent('5%')).toBe(5);
    expect(parseSlippagePercent('5')).toBe(5);
    expect(parseSlippagePercent('0.5%')).toBe(0.5);
  });

  it('rejects out-of-range values', () => {
    expect(parseSlippagePercent('0')).toBeNull();
    expect(parseSlippagePercent('51%')).toBeNull();
  });
});

describe('parseTelegramTradeCommand', () => {
  it('parses margin, leverage, and optional slippage', () => {
    expect(parseTelegramTradeCommand('/up 0.1 1x 5%')).toEqual({
      marginUsd: 0.1,
      leverageRaw: '1x',
      slippagePct: 5,
    });
    expect(parseTelegramTradeCommand('/down 10 4x')).toEqual({
      marginUsd: 10,
      leverageRaw: '4x',
      slippagePct: null,
    });
  });

  it('rejects invalid slippage tokens', () => {
    expect(parseTelegramTradeCommand('/up 0.1 1x 0%')).toBeNull();
    expect(parseTelegramTradeCommand('/up 0.1 1x foo')).toBeNull();
  });
});

describe('formatSlippagePercent', () => {
  it('formats whole and fractional percents', () => {
    expect(formatSlippagePercent(5)).toBe('5%');
    expect(formatSlippagePercent(0.5)).toBe('0.5%');
  });
});
