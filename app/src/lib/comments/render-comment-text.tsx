import type { ReactNode } from "react";

const GIF_URL_PATTERN =
  /(?:https?:\/\/(?:media\d?\.giphy\.com|i\.giphy\.com)[^\s]+|\/comments\/gifs\/[^\s]+)/gi;

export function appendToCommentText(current: string, addition: string): string {
  if (!addition) return current;
  if (!current.trim()) return addition;
  return `${current}${current.endsWith(" ") ? "" : " "}${addition}`;
}

export function renderCommentText(text: string) {
  const parts = text.split(GIF_URL_PATTERN);
  const matches = text.match(GIF_URL_PATTERN) ?? [];

  if (matches.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{text}</span>;
  }

  const nodes: ReactNode[] = [];
  parts.forEach((part, index) => {
    if (part) nodes.push(<span key={`text-${index}`}>{part}</span>);
    const gifUrl = matches[index];
    if (gifUrl) {
      nodes.push(
        <img
          key={`gif-${index}`}
          src={gifUrl}
          alt="GIF"
          className="mt-2 max-h-48 w-auto max-w-full rounded-md"
          loading="lazy"
        />,
      );
    }
  });

  return <div className="space-y-1 whitespace-pre-wrap break-words">{nodes}</div>;
}
