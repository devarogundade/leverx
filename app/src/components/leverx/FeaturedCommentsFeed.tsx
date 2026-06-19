import { shortAddress } from "@/components/leverx/CopyField";
import { JazziconAvatar } from "@/components/leverx/comments/JazziconAvatar";
import { useMarketComments } from "@/hooks/useMarketComments";
import { renderCommentBody } from "@/lib/comments/render-comment-text";
import type { MarketComment } from "@/lib/comments/types";
import { isFirebaseConfigured } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { Timestamp } from "firebase/firestore";

const MARQUEE_COUNT = 8;

interface Props {
  oracleId: string;
  className?: string;
}

function FeaturedCommentItem({ comment }: { comment: MarketComment; }) {
  return (
    <div className="featured-market-comment">
      <JazziconAvatar address={comment.address} size={24} />
      <div className="min-w-0 flex-1">
        <p className="featured-market-comment-user">{shortAddress(comment.address, 4, 4)}</p>
        <p className="featured-market-comment-text">{renderCommentBody(comment)}</p>
      </div>
    </div>
  );
}

const SimulatedComments: MarketComment[] = [{
  id: "1",
  address: "0x5e56d7faeb76ca2d6ec2966d192948901a4742cf429304d778d7bee8df4122a0",
  timestamp: Timestamp.fromDate(new Date()),
  text: "",
  type: "gif",
  path: "/comments/gifs/Give%20Up%20Crying%20GIF%20by%20Pudgy%20Penguins.gif",
  likes: [],
  replies: [],
},
{
  id: "2",
  address: "0xb804a62e626c53ba707aafbb6f8e9406d375fe79af00545e8427c3f403283357",
  timestamp: Timestamp.fromDate(new Date()),
  text: "Got liquidated 🤣 😭",
  type: "text",
  path: "",
  likes: [],
  replies: [],
},
{
  id: "3",
  address: "0x87efada1ce85bf7fa6c7eff64355f7de19f7a67203897e002d2813f7f9c6e690",
  timestamp: Timestamp.fromDate(new Date()),
  text: "",
  type: "gif",
  path: "/comments/gifs/Fire%20Elmo%20GIF.gif",
  likes: [],
  replies: [],
},
{
  id: "4",
  address: "0x5e56d7faeb76ca2d6ec2966d192948901a4742cf429304d778d7bee8df4122a0",
  timestamp: Timestamp.fromDate(new Date()),
  text: "Let's gooooo 🤣💸💸",
  type: "text",
  path: "",
  likes: [],
  replies: [],
}, {
  id: "5",
  address: "0x79a103f1e486a5c6c50f447ee85f52c4b28b499a73c340960d9c4ef714c80d43",
  timestamp: Timestamp.fromDate(new Date()),
  text: "",
  type: "gif",
  path: "/comments/gifs/Cry%20Baby%20Crying%20GIF%20by%20Luis%20Ricardo.gif",
  likes: [],
  replies: [],
}, {
  id: "6",
  address: "0x2ae7f80d16feb037cf7974a98be6921c02195b001b9b03c0b051b4ebb6410714",
  timestamp: Timestamp.fromDate(new Date()),
  text: "UP UP UP",
  type: "text",
  path: "",
  likes: [],
  replies: [],
}, {
  id: "7",
  address: "0xdc68ac44eb736faaf2c98f0b8ad4b1a574b3fc13a0992c49990b9949494ad1f0",
  timestamp: Timestamp.fromDate(new Date()),
  text: "",
  type: "gif",
  path: "/comments/gifs/Despicable%20Me%20What%20GIF.gif",
  likes: [],
  replies: [],
}, {
  id: "8",
  address: "0x8eb866217fbf61df8c1b7ca514fbdaeb5d6689a91814d56507006bee887cb513",
  timestamp: Timestamp.fromDate(new Date()),
  text: "Not funny bro",
  type: "text",
  path: "",
  likes: [],
  replies: [],
}, {
  id: "9",
  address: "0xcca26f7ae2e40604498294e95bacccc4652cc8cb2aa074d7ee608c7e7bdf0c29",
  timestamp: Timestamp.fromDate(new Date()),
  text: "Got 0.41 profit with 3.6x 🤣 🤣",
  type: "text",
  path: "",
  likes: [],
  replies: [],
},
{
  id: "10",
  address: "0xcca26f7ae2e40604498294e95bacccc4652cc8cb2aa074d7ee608c7e7bdf0c29",
  timestamp: Timestamp.fromDate(new Date()),
  text: "",
  type: "gif",
  path: "/comments/gifs/Happy%20Lets%20Go%20GIF%20by%20SpongeBob%20SquarePants.gif",
  likes: [],
  replies: [],
},
];

export function FeaturedCommentsFeed({ oracleId, className }: Props) {
  const { comments, loading } = useMarketComments(oracleId);
  const preview = [...comments, ...SimulatedComments].slice(0, MARQUEE_COUNT);
  const loop = preview.length > 0 ? [...preview, ...preview] : [];

  if (!isFirebaseConfigured()) {
    return (
      <div className={cn("featured-market-comments", className)}>
        <p className="featured-market-comments-empty">Comments unavailable</p>
      </div>
    );
  }

  if (loading && preview.length === 0) {
    return (
      <div className={cn("featured-market-comments featured-market-comments--loading", className)}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="featured-market-comment-skeleton" aria-hidden />
        ))}
      </div>
    );
  }

  if (preview.length === 0) {
    return (
      <div className={cn("featured-market-comments", className)}>
        <p className="featured-market-comments-empty">No comments yet — be the first</p>
      </div>
    );
  }

  const durationSec = Math.max(18, preview.length * 5);

  return (
    <div
      className={cn("featured-market-comments featured-market-comments--marquee", className)}
      aria-label="Recent comments"
    >
      <div
        className="featured-market-comments-track"
        style={{ animationDuration: `${durationSec}s` }}
      >
        {loop.map((comment, index) => (
          <FeaturedCommentItem key={`${comment.id}-${index}`} comment={comment} />
        ))}
      </div>
    </div>
  );
}
