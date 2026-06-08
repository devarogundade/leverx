import { cn } from "@/lib/utils";

/** Uppercase field labels */
export const labelCaps =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

/** Small leverage multiplier pill */
export const leverageBadge =
  "inline-flex items-center rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.06em] text-muted-foreground";

/** Bordered card surface (trade panels, charts) */
export const tradeSurface = cn(
  "overflow-hidden rounded-xl border border-border bg-card",
  "shadow-[0_1px_0_0_color-mix(in_oklab,white_4%,transparent)_inset,0_1px_2px_0_color-mix(in_oklab,black_16%,transparent)]",
  "light:shadow-[0_1px_0_0_white_inset,0_1px_2px_0_color-mix(in_oklab,black_6%,transparent),0_12px_28px_-20px_color-mix(in_oklab,black_18%,transparent)]",
);

/** Trade leverage panel — extends trade surface; height follows content only */
export const tradeLeveragePanel = cn(
  tradeSurface,
  "flex flex-col lg:h-auto lg:max-h-none lg:min-h-0",
);

/** Amount / limit price input wrapper */
export const tradeInputCard = cn(
  "rounded-lg border border-border bg-card px-5 py-4",
  "[&_input]:border-0 [&_input]:bg-transparent [&_input]:shadow-none",
  "[&_input]:outline-none [&_input]:ring-0 [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-0",
);

/** Input nested inside a bordered field shell — no inner border or focus ring */
export const inputInField = cn(
  "h-auto min-h-0 flex-1 border-0 bg-transparent p-0 shadow-none",
  "outline-none ring-0 focus-visible:outline-none focus-visible:ring-0",
);

/** Joined segmented control container */
export const segTabs = cn(
  "inline-flex max-w-full items-stretch gap-0 overflow-hidden rounded-sm border border-border bg-surface p-0",
  "[&>*+*]:border-l [&>*+*]:border-border",
);

export const segTabsStretch = "flex w-full [&>*]:min-w-0 [&>*]:flex-1";

export const segTabsScroll = cn(
  "overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
);

export const segTabsIcon =
  "[&>*]:min-h-11 [&>*]:min-w-11 [&>*]:p-2.5 sm:[&>*]:min-h-8 sm:[&>*]:min-w-8 sm:[&>*]:p-[0.4375rem]";

export const segTabsPlain =
  "inline-flex items-stretch gap-1 overflow-visible border-0 bg-transparent p-0 [&>*+*]:border-0";

/** Individual segmented tab */
export const segTab = cn(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5",
  "rounded-none border-0 bg-transparent",
  "px-3.5 py-[0.4375rem] text-[0.8125rem] font-medium leading-[1.2] text-muted-foreground whitespace-nowrap",
  "transition-[background-color,color] duration-150",
  "hover:bg-hover/55 hover:text-foreground",
  "sm:px-4 sm:py-2 sm:text-sm",
);

export const segTabActive = "bg-hover font-semibold text-foreground";

export const segTabPlain = cn(
  segTab,
  "rounded-sm px-2.5 py-1.5",
  "data-[state=active]:rounded-none data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground",
  "data-[state=active]:shadow-[inset_0_-2px_0_var(--color-accent)]",
);

export const segTabRangeActive =
  "!bg-[color-mix(in_oklab,var(--color-accent)_12%,var(--color-hover))] !font-semibold !text-accent";

/** Outcome tabs in trade terminal header */
export const segTabOutcome = cn(
  segTab,
  "text-xs font-bold tracking-[0.04em] no-underline sm:text-[0.8125rem]",
);

export const sideToggleLongActive = "bg-[var(--long-bg)] font-semibold text-[var(--long-text)]";
export const sideToggleShortActive = "bg-[var(--short-bg)] font-semibold text-[var(--short-text)]";

export function segTabsClass(
  ...variants: ("stretch" | "scroll" | "icon" | "plain" | "outcomes")[]
) {
  return cn(
    variants.includes("plain") ? segTabsPlain : segTabs,
    variants.includes("stretch") && segTabsStretch,
    variants.includes("scroll") && segTabsScroll,
    variants.includes("icon") && segTabsIcon,
    variants.includes("outcomes") && "max-w-none w-full",
  );
}

/** Centered empty / loading state region */
export const pageState =
  "flex min-h-[min(var(--markets-catalog-h),70vh)] flex-1 items-center justify-center [&_.lx-empty]:w-full [&_.lx-empty]:max-w-md";

/** Simple page layout */
export const pageSimple = "flex w-full flex-col gap-4";

export const pageSimpleToolbar =
  "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";

export const pageSimpleTitle =
  "min-w-0 text-lg font-semibold tracking-tight sm:text-xl [overflow-wrap:anywhere]";

export const pageSimpleActions = "flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2";

export const vaultWorkspace = cn(
  "grid gap-[var(--trade-gap)]",
  "md:grid-cols-[minmax(0,1fr)_var(--trade-sidebar-w)] md:items-start",
);

export const vaultChart = "min-w-0";

export const vaultAction = "min-w-0 md:self-start";

/** Flat page section with optional top rule */
export const pageBlock = "flex flex-col gap-4";

export const pageBlockRuled = "border-t border-border pt-6";

export const statTile = "py-2";

export const statValue =
  "text-2xl font-bold tracking-tight tabular-nums text-foreground sm:text-3xl";

/** Soft pill toggle — secondary choices without bordered seg-tab chrome */
export const pillToggleGroup =
  "inline-flex shrink-0 items-center gap-0.5 rounded-md bg-surface p-0.5";

export const pillToggleBtn = "rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors";

export const pillToggleActive = "bg-card font-semibold text-foreground shadow-sm";

export const pillToggleIdle = "text-muted-foreground hover:text-foreground";

/** Text filter links — tertiary toggles beside underline tabs */
export const textFilterGroup = "flex shrink-0 flex-wrap items-center gap-2 sm:gap-3";

export const textFilterBtn =
  "text-xs font-medium text-muted-foreground transition-colors hover:text-foreground";

export const textFilterActive =
  "font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-4";

/** Count pill inside tabs */
export const pillCount = "rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-accent";

/** Markets grid responsive columns */
export const marketsGrid =
  "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4";

/** Market card shell */
export const marketCard = cn(
  "group relative flex min-h-[11.5rem] cursor-pointer flex-col overflow-hidden",
  "rounded-xl border border-border",
  "bg-gradient-to-b from-[color-mix(in_oklab,var(--color-card)_92%,white_8%)] to-card",
  "shadow-[0_1px_0_0_color-mix(in_oklab,white_5%,transparent)_inset,0_2px_6px_-3px_color-mix(in_oklab,black_22%,transparent)]",
  "transition-[border-color,box-shadow,transform,background-color] duration-220",
  "hover:border-border-strong hover:bg-[color-mix(in_oklab,var(--color-hover)_35%,var(--color-card))]",
  "has-[a.market-card-overlay:hover]:bg-[color-mix(in_oklab,var(--color-hover)_35%,var(--color-card))]",
);

export const marketCardOverlay = cn(
  "market-card-overlay pointer-events-none absolute inset-0 z-[1] rounded-[inherit] no-underline",
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
);

export const marketCardBody = "pointer-events-none relative z-0 flex flex-col gap-3 p-4";

export const marketCardInteractive = "pointer-events-auto relative z-[2]";

export const marketCardHeader = "flex items-start gap-2";

export const marketCardPrice = "ml-auto text-right";

export const marketCardPriceValue = "font-mono text-sm font-semibold tabular-nums sm:text-lg";

export const marketCardActions = cn(marketCardInteractive, "market-card-interactive w-full");

export const marketCardAction = cn(
  "flex h-8 items-center justify-center rounded-md border border-border bg-surface",
  "text-xs font-bold tracking-[0.04em] text-muted-foreground",
  "transition-[border-color,color,background-color] duration-150",
  "hover:border-border-strong hover:bg-hover hover:text-foreground",
);

export const marketCardActionLong =
  "hover:border-[color-mix(in_oklab,var(--color-success)_40%,var(--color-border))] hover:text-success";

export const marketCardActionShort =
  "hover:border-[color-mix(in_oklab,var(--color-destructive)_40%,var(--color-border))] hover:text-destructive";

/** Joined UP / DOWN / RANGE action group — shared across grid and table */
export const marketSideActions = cn(
  "inline-flex overflow-hidden rounded-md border border-border bg-surface",
);

export const marketSideActionsStretch = "[&>*]:min-w-0 [&>*]:flex-1";

export const marketSideAction = cn(
  "relative z-[2] inline-flex min-h-11 cursor-pointer items-center justify-center px-3 no-underline sm:min-h-8 sm:h-8 sm:px-2.5",
  "pointer-events-auto border-l border-border first:border-l-0",
  "text-[0.6875rem] font-bold tracking-wide text-muted-foreground",
  "transition-[color,background-color] duration-150",
);

export const marketSideActionUp = "hover:bg-[var(--long-bg)] hover:text-[var(--long-text)]";

export const marketSideActionDown = "hover:bg-[var(--short-bg)] hover:text-[var(--short-text)]";

export const marketSideActionRange =
  "hover:bg-[color-mix(in_oklab,var(--color-accent)_12%,var(--color-hover))] hover:text-accent";

export const marketCardMeta =
  "flex items-center justify-between text-[0.6875rem] text-muted-foreground";

export const marketCardSparkline =
  "pointer-events-none relative z-0 h-8 bg-[color-mix(in_oklab,var(--color-surface)_50%,transparent)]";

/** Trade terminal layout */
export const tradeTerminal = "flex w-full flex-col";

export const tradeTerminalHeader = "flex flex-col gap-3 pb-3";

export const tradeTerminalHeaderTop =
  "flex min-w-0 flex-wrap items-start gap-3";

export const tradeTerminalHeaderMetrics = cn(
  "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-[var(--trade-gap)]",
  "lg:grid-cols-[minmax(0,1fr)_var(--trade-orderbook-w)_var(--trade-sidebar-w)]",
);

export const tradeTerminalTitle = "text-sm font-semibold leading-snug sm:text-base md:text-lg";

export const tradeTerminalBack = cn(
  "mt-1 inline-block text-xs text-muted-foreground transition-colors duration-150",
  "hover:text-accent",
);

export const tradeOracleNav = "flex shrink-0 items-center gap-0.5";

export const tradeOracleNavBtn = cn(
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface",
  "text-muted-foreground transition-colors duration-150",
  "hover:bg-hover hover:text-foreground",
);

export const tradeOracleNavBtnDisabled = cn(
  "pointer-events-none opacity-35 hover:bg-surface hover:text-muted-foreground",
);

export const tradeStatRow = cn(
  "grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 sm:gap-x-6",
  "lg:col-start-1 lg:grid-cols-5 lg:gap-x-4",
);

export const tradeStatItem = "flex flex-col gap-0.5";

export const tradeStatItemLabel = "text-[0.6875rem] text-muted-foreground";

export const tradeStatItemValue =
  "font-mono text-[0.8125rem] font-medium tabular-nums text-foreground";

export const tradeTerminalBody = "flex flex-col gap-[var(--trade-gap)]";

export const tradeTerminalWorkspace = cn(
  "trade-terminal-workspace flex min-w-0 flex-col gap-[var(--trade-gap)]",
  "md:grid md:grid-cols-2 md:items-start",
  "lg:grid-cols-[minmax(0,1fr)_var(--trade-orderbook-w)_var(--trade-sidebar-w)]",
  "lg:grid-rows-[var(--trade-chart-h)_auto]",
);

export const tradeTerminalChart = cn(
  "trade-terminal-chart order-0 flex min-h-0 min-w-0 flex-col",
  "min-h-[var(--trade-chart-h)] md:col-start-1 md:row-start-1",
  "lg:h-[var(--trade-chart-h)] lg:max-h-[var(--trade-chart-h)]",
);

export const tradeTerminalOrderbook = cn(
  "trade-terminal-orderbook order-1 min-w-0 min-h-[240px] sm:min-h-[280px]",
  "md:col-start-2 md:row-start-1 md:min-h-[var(--trade-chart-h)]",
  "lg:h-[var(--trade-chart-h)] lg:max-h-[var(--trade-chart-h)]",
);

export const tradeTerminalSidebar = cn(
  "trade-terminal-sidebar order-2 flex min-w-0 w-full flex-col gap-3",
  "md:col-span-2 md:row-start-2",
  "lg:order-none lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:w-[var(--trade-sidebar-w)] lg:self-start",
);

export const tradeTerminalPositions = cn(
  "trade-terminal-positions order-3 min-w-0 overflow-hidden rounded-lg border border-border bg-card",
  "md:col-span-2 md:row-start-3",
  "lg:col-span-2 lg:col-start-1 lg:row-start-2",
);

export const tradeTerminalTabsRow = cn(
  "flex flex-col gap-2 p-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-3",
);

export const tradeTerminalPositionsBody = cn(
  "h-[var(--trade-positions-body-h)] min-h-[var(--trade-positions-body-h)] overflow-y-auto p-4",
  "text-sm text-muted-foreground",
);

export const tradeSummaryGrid = "grid w-full grid-cols-2 gap-3 sm:grid-cols-4";

/** Leverage picker */
export const leveragePickerHeader = "mb-2 flex items-center justify-between gap-2";

export const leveragePickerValue = "font-mono text-base font-bold tabular-nums text-accent";

export const leveragePickerTab = "px-1 py-1.5 font-mono text-[0.6875rem] tabular-nums";

/** TP/SL block */
export const tpSlBlock = "flex flex-col gap-2.5";

export const tpSlHeader = "flex items-center justify-between gap-3";

export const tpSlFields = "flex flex-col gap-2";

export const tpSlRow = cn(
  "flex items-center gap-2 rounded-sm border border-border bg-surface",
  "py-0.5 pl-2.5 pr-0.5",
  "[&_input]:border-0 [&_input]:bg-transparent [&_input]:shadow-none",
  "[&_input]:outline-none [&_input]:ring-0 [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-0",
);

export const tpSlLabel =
  "w-6 shrink-0 text-[0.6875rem] font-bold tracking-wide text-muted-foreground";

export const tpSlInput = cn(inputInField, "py-1.5 font-mono text-[0.8125rem]");

export const tpSlUnit = cn(
  "h-7 w-auto min-w-0 shrink-0 rounded-none rounded-r-sm border-0 border-l border-border bg-card px-2 text-xs shadow-none",
);

/** Trade sign-in CTA */
export const btnTradeSignin = cn(
  "!h-[var(--btn-action-h)] w-full rounded-lg text-[0.9375rem] font-bold",
  "bg-[var(--trade-signin)] text-white hover:bg-[var(--trade-signin-hover)] hover:brightness-100",
);

/** Trade submit CTA tinted by outcome (UP / DOWN / RANGE). */
export function tradeCtaClass(side: "up" | "down" | "range"): string {
  return cn(
    btnTradeSignin,
    side === "up" && "!bg-success !text-white hover:!bg-[#2dd4a8] hover:brightness-100",
    side === "down" &&
      "!bg-destructive !text-destructive-foreground hover:!bg-destructive/90 hover:brightness-100",
    side === "range" && "!bg-accent !text-white hover:opacity-90 hover:brightness-100",
  );
}

/** Secondary landing-style link button */
export const landingCtaSecondary = cn(
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border-strong",
  "bg-transparent px-4 py-2 text-sm font-medium text-foreground",
  "transition-[border-color,background-color] duration-150",
  "hover:border-foreground hover:bg-hover",
);

/** Order book */
export const orderbookSideHeader = cn(
  "grid shrink-0 grid-cols-3 gap-1 px-2 pb-1.5",
  "text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground",
);

export const orderbookRow = "relative grid grid-cols-3 gap-1 px-2 py-0.5";

export const orderbookRowDepth = "pointer-events-none absolute inset-y-0";

export const orderbookMid = cn("flex shrink-0 items-center justify-center gap-3 py-2.5 text-xs");

export const orderbookStack = "flex min-h-0 flex-1 flex-col";

export const orderbookStackSection = "flex min-h-0 flex-1 flex-col";

export const orderbookStackRows = "flex min-h-0 flex-1 flex-col overflow-y-auto";

export const orderbookSentiment = "flex h-1 overflow-hidden rounded-full";

export const orderbookSentimentLabels =
  "mt-1.5 flex justify-between text-[0.625rem] text-muted-foreground";

/** Markets table */
export const marketsTableShell =
  "flex min-h-0 flex-col gap-3 overflow-hidden lg:min-h-[var(--markets-catalog-h)]";

export const marketsTableScroll = "min-h-0 flex-1 overflow-x-auto overscroll-x-contain";

export const marketsTable =
  "w-full min-w-[40rem] border-separate border-spacing-0 text-[0.8125rem] lg:min-w-[52rem]";

export const marketsTableMobileList = "space-y-3 lg:hidden";

export const marketsTableMobileCard = cn(tradeSurface, "flex flex-col gap-3 p-4");

export const marketsTableMobileCardHeader = "flex items-start gap-2.5 border-b border-border pb-3";

export const marketsTableMobileCardStats = "grid grid-cols-2 gap-x-3 gap-y-2.5";

export const marketsTableMobileStatLabel =
  "text-[10px] font-medium uppercase tracking-wider text-muted-foreground";

export const marketsTableMobileStatValue = "text-sm text-foreground";

export const marketsTableDesktop = "hidden lg:block";

export const marketsTh = cn(
  "border-b border-border bg-[color-mix(in_oklab,var(--color-surface)_65%,var(--color-card))]",
  "px-4 py-3 text-left align-middle whitespace-nowrap",
);

export const marketsThBtn = cn(
  "inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0",
  "text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground",
  "transition-colors duration-150 hover:text-foreground",
);

export const marketsRow = cn(
  "border-b border-border transition-colors duration-150 last:border-b-0",
  "hover:bg-hover/70",
);

export const marketsTd = "px-4 py-3 align-middle";

export const marketsTdMarket = "max-w-md";

export const marketsTdMono = "font-mono tabular-nums text-foreground";

export const marketsTdMuted = "text-xs whitespace-nowrap text-muted-foreground";

export const marketsTdTrade = "pr-4";

export const marketsTdHideLg = "hidden xl:table-cell";

export const marketsTdHideMd = "hidden lg:table-cell";

export const marketsTdHideSm = "hidden sm:table-cell";

export const marketsThMarket = "min-w-64";

export const marketsThTrade = "w-[1%] pr-4";

export const marketsThHideLg = "hidden xl:table-cell";

export const marketsThHideMd = "hidden lg:table-cell";

export const marketsThHideSm = "hidden sm:table-cell";

export const marketsThBtnRight = "ml-auto";

export const marketsThSortActive = "text-accent";

export const marketsBookmark = cn(
  "h-8 w-8 min-w-8 shrink-0 text-muted-foreground hover:text-accent",
);

export const marketsPriceCell = "flex items-center gap-1.5 font-mono tabular-nums";

export const marketsPriceValue = "font-semibold text-foreground";

export const marketsChange = "font-mono text-xs font-semibold tabular-nums";

export const marketsTradePillHideMobile = "hidden sm:inline-flex";

export const marketsMarketCell = "flex min-w-0 items-center gap-2.5";

export const marketsMarketLink = cn(
  "line-clamp-2 text-xs leading-snug text-foreground no-underline transition-colors duration-150 hover:text-accent",
);

export const marketsTradeActions = "flex items-center justify-end";

export const marketsTradePill = marketSideAction;

export const marketsTradePillUp = marketSideActionUp;

export const marketsTradePillDown = marketSideActionDown;

export const marketsTradePillRange = marketSideActionRange;

export const catalogPagination = cn(
  "flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3",
);

export const catalogPaginationInfo = "text-xs text-muted-foreground tabular-nums";

/** Featured carousel / hero */
export const heroPanel = "flex h-full min-h-[var(--markets-hero-h)] flex-col py-1";

export const featuredCarouselRow = cn(
  "flex h-[var(--featured-carousel-row-h)] items-center gap-3 rounded-md px-2",
);

export const featuredCarouselRowEmpty = cn(featuredCarouselRow, "pointer-events-none invisible");

export const btnIcon = cn(
  "inline-flex h-8 w-8 min-w-8 items-center justify-center rounded-xl",
  "border border-border bg-transparent text-muted-foreground",
  "transition-colors duration-150 hover:bg-hover hover:text-foreground",
);

export const livePulse = cn(
  "h-2 w-2 shrink-0 rounded-full bg-success",
  "shadow-[0_0_0_0_color-mix(in_oklab,var(--color-success)_50%,transparent)]",
  "animate-[lx-pulse-ring_2.2s_ease-out_infinite]",
);

export const marketsCatalogRegion = "min-h-[var(--markets-catalog-h)]";
