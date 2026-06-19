import { useCallback, useEffect, useState } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";
import type { CommentPayload, CommentReply, CommentType, MarketComment } from "@/lib/comments/types";

const PAGE_SIZE = 10;

function normalizeType(raw: Record<string, unknown>): CommentType {
  return raw.type === "gif" ? "gif" : "text";
}

function normalizeReply(raw: Record<string, unknown>, index: number): CommentReply {
  const type = normalizeType(raw);
  return {
    id: typeof raw.id === "string" ? raw.id : `reply-${index}`,
    address: typeof raw.address === "string" ? raw.address : "",
    timestamp: raw.timestamp as Timestamp,
    type,
    text: typeof raw.text === "string" ? raw.text : "",
    path: typeof raw.path === "string" ? raw.path : "",
    likes: Array.isArray(raw.likes) ? raw.likes.filter((v): v is string => typeof v === "string") : [],
  };
}

function normalizeComment(id: string, raw: Record<string, unknown>): MarketComment {
  const type = normalizeType(raw);
  const replies = Array.isArray(raw.replies)
    ? raw.replies.map((entry, index) => normalizeReply(entry as Record<string, unknown>, index))
    : [];

  return {
    id,
    address: typeof raw.address === "string" ? raw.address : "",
    timestamp: raw.timestamp as Timestamp,
    type,
    text: typeof raw.text === "string" ? raw.text : "",
    path: typeof raw.path === "string" ? raw.path : "",
    likes: Array.isArray(raw.likes) ? raw.likes.filter((v): v is string => typeof v === "string") : [],
    replies,
  };
}

function commentsCollection(oracleId: string) {
  const db = getFirebaseDb();
  if (!db) return null;
  return collection(db, "comments", oracleId, "items");
}

function toFirestorePayload(payload: CommentPayload) {
  if (payload.type === "gif") {
    return {
      type: "gif" as const,
      text: "",
      path: payload.path,
    };
  }

  return {
    type: "text" as const,
    text: payload.text.trim(),
    path: "",
  };
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
    async (address: string, payload: CommentPayload) => {
      const col = commentsCollection(oracleId);
      if (!col) throw new Error("Comments are not configured.");

      setPosting(true);
      try {
        await addDoc(col, {
          address,
          ...toFirestorePayload(payload),
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
    async (commentId: string, address: string, payload: CommentPayload) => {
      const db = getFirebaseDb();
      if (!db) return;

      const ref = doc(db, "comments", oracleId, "items", commentId);
      const reply: CommentReply = {
        id: crypto.randomUUID(),
        address,
        ...toFirestorePayload(payload),
        timestamp: Timestamp.now(),
        likes: [],
      };

      await updateDoc(ref, {
        replies: arrayUnion(reply),
      });
    },
    [oracleId],
  );

  const deleteComment = useCallback(
    async (commentId: string, address: string) => {
      const db = getFirebaseDb();
      if (!db) throw new Error("Comments are not configured.");

      const ref = doc(db, "comments", oracleId, "items", commentId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      if (snap.data().address !== address) {
        throw new Error("You can only delete your own comments.");
      }

      await deleteDoc(ref);
    },
    [oracleId],
  );

  const deleteReply = useCallback(
    async (commentId: string, replyId: string, address: string) => {
      const db = getFirebaseDb();
      if (!db) throw new Error("Comments are not configured.");

      const ref = doc(db, "comments", oracleId, "items", commentId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const raw = snap.data();
      const replies = Array.isArray(raw.replies) ? raw.replies : [];
      const target = replies.find(
        (entry) => typeof entry === "object" && entry !== null && (entry as { id?: string }).id === replyId,
      ) as { address?: string } | undefined;

      if (!target || target.address !== address) {
        throw new Error("You can only delete your own replies.");
      }

      const nextReplies = replies.filter(
        (entry) => typeof entry === "object" && entry !== null && (entry as { id?: string }).id !== replyId,
      );

      await updateDoc(ref, { replies: nextReplies });
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
    deleteComment,
    deleteReply,
    loadMore,
    hasMore,
  };
}
