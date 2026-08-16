import { useEffect, useState } from "react";
import type { InboxThread, NoTVerseNote, NoTVersePreferences, NotebookRecord } from "./types";

export const defaultNoTVersePreferences: NoTVersePreferences = {
  setupComplete: false,
  interests: ["Manga", "Novels", "PDFs"],
  discovery: [
    "Title, author, series or ISBN",
    "Describe something from memory",
    "Scan a cover",
    "Scan a page",
    "Paste a source link",
    "Voice description",
  ],
  accentIntensity: 74,
  readerFont: "serif",
  noteFont: "handwritten",
  reducedMotion: false,
  paperTexture: 72,
  readingVisibility: "approximate",
  spoilerPreference: "progress",
  community: {
    seePublicNotes: true,
    seeLibraryNotes: true,
    allowFollowers: true,
    messageRequests: true,
    appearInNotebooks: true,
    privateByDefault: true,
  },
};

const starterSketch = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 210">
  <rect width="320" height="210" fill="#eee8de"/>
  <g fill="none" stroke="#514943" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M28 172c36-24 67-30 100-24 36 7 70 4 107-13 20-9 39-12 57-8"/>
    <path d="M97 145c-12-28-8-57 13-77 21-20 55-25 82-8 24 15 36 43 30 70"/>
    <path d="M115 82c21 2 34-5 48-20 5 13 15 24 31 34"/>
    <path d="M135 104l12 2m31 0 12-3m-47 27c13 8 28 8 44-1"/>
    <path d="M103 149l-31 39m144-50 42 48M41 42l57 44m177-48-57 49"/>
  </g>
  <text x="20" y="28" font-family="Georgia" font-style="italic" font-size="18" fill="#77706b">a moment worth keeping</text>
</svg>`)} `;

export const starterNotes: NoTVerseNote[] = [
  {
    id: "note-zoro-growth",
    author: "ZoroFan_22",
    notebook: "One Piece Notebook",
    createdAt: "2h ago",
    text: "Zoro’s growth in this arc is insane. Can’t wait to see what happens next! Especially the moment he stood up after everything. Goosebumps.",
    type: "Reaction",
    visibility: "public",
    book: "One Piece",
    chapter: "Wano Arc",
    spoilerBoundary: "No spoilers beyond the reader’s progress",
    tags: ["WanoArc", "Zoro"],
    image: { id: "starter-sketch", name: "chapter-sketch.svg", dataUrl: starterSketch.trim() },
    reactions: 124,
    replies: 28,
    saved: false,
  },
  {
    id: "note-berserk-art",
    author: "MangaMuse",
    notebook: "Berserk Notebook",
    createdAt: "5h ago",
    text: "The artwork in this chapter was absolutely incredible. Every panel feels deliberate; the silence carries as much weight as the dialogue.",
    type: "Review",
    visibility: "public",
    book: "Berserk",
    chapter: "Chapter 364",
    spoilerBoundary: "Spoilers up to Chapter 364",
    tags: ["Berserk", "Artwork"],
    reactions: 91,
    replies: 17,
    saved: true,
  },
  {
    id: "note-rich-dad",
    author: "Nancy",
    notebook: "My Notebook",
    createdAt: "Just now",
    text: "The useful difference is not simply rich versus poor. It is how each person defines an asset, risk and freedom.",
    type: "Thought",
    visibility: "private",
    book: "Rich Dad Poor Dad",
    page: "Page 37",
    spoilerBoundary: "No spoilers",
    tags: ["Money", "Mindset"],
    reactions: 0,
    replies: 0,
    saved: true,
    mine: true,
  },
];

export const starterNotebooks: NotebookRecord[] = [
  {
    id: "notebook-one-piece",
    name: "One Piece Notebook",
    description: "A spoiler-aware notebook for readers moving through the Grand Line at different speeds.",
    type: "Public",
    members: 1264,
    coverAccent: "#ff4fa3",
    readingList: ["One Piece", "One Piece: Ace’s Story"],
  },
  {
    id: "notebook-private",
    name: "My Notebook",
    description: "Private thoughts, passages, questions and reading records.",
    type: "Private",
    members: 1,
    coverAccent: "#9a60ff",
    readingList: [],
  },
];

export const starterInbox: InboxThread[] = [
  { id: "thread-manga-muse", name: "MangaMuse", preview: "That panel is exactly what I meant.", time: "5:42", unread: 2, kind: "person", presence: "offline" },
  { id: "thread-notebook", name: "One Piece Notebook", preview: "You were invited to the Chapter 1120 discussion.", time: "Yesterday", unread: 1, kind: "group" },
  { id: "thread-reading", name: "Reading Room", preview: "Kashi shared a Note with you.", time: "Mon", unread: 0, kind: "group" },
];

export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) as T : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("notverse:state-changed", { detail: { key } }));
  }, [key, value]);

  return [value, setValue] as const;
}
