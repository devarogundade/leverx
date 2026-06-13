import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  MARKET_FAVORITES_STORAGE_KEY,
  readMarketFavorites,
  writeMarketFavorites,
} from "@/lib/market-favorites";

interface MarketFavoritesContextValue {
  favorites: ReadonlySet<string>;
  favoriteCount: number;
  isFavorite: (oracleId: string) => boolean;
  toggleFavorite: (oracleId: string) => void;
}

const MarketFavoritesContext = createContext<MarketFavoritesContextValue | null>(null);

export function MarketFavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setFavorites(new Set(readMarketFavorites()));
  }, []);

  useEffect(() => {
    const sync = () => setFavorites(new Set(readMarketFavorites()));
    const onStorage = (event: StorageEvent) => {
      if (event.key === MARKET_FAVORITES_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleFavorite = useCallback((oracleId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(oracleId)) next.delete(oracleId);
      else next.add(oracleId);
      writeMarketFavorites([...next]);
      return next;
    });
  }, []);

  const isFavorite = useCallback((oracleId: string) => favorites.has(oracleId), [favorites]);

  const value = useMemo(
    () => ({
      favorites,
      favoriteCount: favorites.size,
      isFavorite,
      toggleFavorite,
    }),
    [favorites, isFavorite, toggleFavorite],
  );

  return (
    <MarketFavoritesContext.Provider value={value}>{children}</MarketFavoritesContext.Provider>
  );
}

export function useMarketFavorites(): MarketFavoritesContextValue {
  const ctx = useContext(MarketFavoritesContext);
  if (!ctx) {
    throw new Error("useMarketFavorites must be used within MarketFavoritesProvider");
  }
  return ctx;
}
