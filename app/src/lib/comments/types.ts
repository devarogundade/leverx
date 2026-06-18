import type { Timestamp } from "firebase/firestore";

export type CommentReply = {
  id: string;
  address: string;
  timestamp: Timestamp;
  text: string;
  likes: string[];
};

export type MarketComment = {
  id: string;
  address: string;
  timestamp: Timestamp;
  text: string;
  likes: string[];
  replies: CommentReply[];
};

export type MarketCommentInput = {
  address: string;
  text: string;
};
