import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import type { CommentReply, MarketComment } from "@/lib/comments/types";

const PAGE_SIZE = 10;

function normalizeReply(raw: Record<string, unknown>, index: number): CommentReply {
  return {
    id: typeof raw.id === "string" ? raw.id : `reply-${index}`,
    address: typeof raw.address === "string" ? raw.address : "",
    timestamp: raw.timestamp as Timestamp,
    text: typeof raw.text === "string" ? raw.text : "",
    likes: Array.isArray(raw.likes) ? raw.likes.filter((v): v is string => typeof v === "string") : [],
  };
}

function normalizeComment(id: string, raw: Record<string, unknown>): MarketComment {
  const replies = Array.isArray(raw.replies)
    ? raw.replies.map((entry, index) => normalizeReply(entry as Record<string, unknown>, index))
    : [];

  return {
    id,
    address: typeof raw.address === "string" ? raw.address : "",
    timestamp: raw.timestamp as Timestamp,
    text: typeof raw.text === "string" ? raw.text : "",
    likes: Array.isArray(raw.likes) ? raw.likes.filter((v): v is string => typeof v === "string") : [],
    replies,
  };
}

function commentsCollection(oracleId: string) {
  const db = getFirebaseDb();
  if (!db) return null;
  return collection(db, "comments", oracleId, "items");
}

export function useMarketComments(oracleId: string) {
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [totalLoaded, setTotalLoaded] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const col = commentsCollection(oracleId);
    if (!col) {
      setComments([]);
      setLoading(false);
      setError("Comments are not configured.");
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(col, orderBy("timestamp", "desc"), limit(totalLoaded));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setComments(
          snapshot.docs.map((docSnap) => normalizeComment(docSnap.id, docSnap.data())),
        );
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Failed to load comments.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [oracleId, totalLoaded]);

  const loadMore = useCallback(() => {
    setTotalLoaded((prev) => prev + PAGE_SIZE);
  }, []);

  const postComment = useCallback(
    async (address: string, text: string) => {
      const col = commentsCollection(oracleId);
      if (!col) throw new Error("Comments are not configured.");

      setPosting(true);
      try {
        await addDoc(col, {
          address,
          text: text.trim(),
          timestamp: serverTimestamp(),
          likes: [],
          replies: [],
        });
      } finally {
        setPosting(false);
      }
    },
    [oracleId],
  );

  const toggleLike = useCallback(
    async (commentId: string, address: string, liked: boolean) => {
      const db = getFirebaseDb();
      if (!db) return;

      const ref = doc(db, "comments", oracleId, "items", commentId);
      await updateDoc(ref, {
        likes: liked ? arrayRemove(address) : arrayUnion(address),
      });
    },
    [oracleId],
  );

  const postReply = useCallback(
    async (commentId: string, address: string, text: string) => {
      const db = getFirebaseDb();
      if (!db) return;

      const ref = doc(db, "comments", oracleId, "items", commentId);
      const reply: CommentReply = {
        id: crypto.randomUUID(),
        address,
        text: text.trim(),
        timestamp: Timestamp.now(),
        likes: [],
      };

      await updateDoc(ref, {
        replies: arrayUnion(reply),
      });
    },
    [oracleId],
  );

  const hasMore = comments.length >= totalLoaded;

  return {
    comments,
    loading,
    error,
    posting,
    postComment,
    toggleLike,
    postReply,
    loadMore,
    hasMore,
  };
}
