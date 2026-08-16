export type NoTVerseNav = "home" | "search" | "notes" | "library" | "inbox" | "me";

export type ReadingInterest =
  | "Manga"
  | "Manhwa"
  | "Comics"
  | "Graphic novels"
  | "Light novels"
  | "Novels"
  | "Research papers"
  | "PDFs"
  | "Textbooks"
  | "Magazines"
  | "Other";

export type DiscoveryPreference =
  | "Title, author, series or ISBN"
  | "Describe something from memory"
  | "Scan a cover"
  | "Scan a page"
  | "Paste a source link"
  | "Voice description";

export type ReadingVisibility = "reading" | "book" | "approximate" | "private";
export type SpoilerPreference = "progress" | "hide" | "completed" | "ask";
export type NoteVisibility = "private" | "followers" | "public" | "notebook" | "direct";
export type NoteType = "Thought" | "Reaction" | "Review" | "Theory" | "Question" | "Recommendation" | "Quote" | "Reading update";

export type NoTVersePreferences = {
  setupComplete: boolean;
  interests: ReadingInterest[];
  discovery: DiscoveryPreference[];
  accentIntensity: number;
  readerFont: "clean" | "serif" | "typewriter";
  noteFont: "handwritten" | "clean" | "typewriter";
  reducedMotion: boolean;
  paperTexture: number;
  readingVisibility: ReadingVisibility;
  spoilerPreference: SpoilerPreference;
  community: {
    seePublicNotes: boolean;
    seeLibraryNotes: boolean;
    allowFollowers: boolean;
    messageRequests: boolean;
    appearInNotebooks: boolean;
    privateByDefault: boolean;
  };
};

export type NoteAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};

export type NoTVerseNote = {
  id: string;
  author: string;
  avatar?: string;
  notebook: string;
  createdAt: string;
  text: string;
  type: NoteType;
  visibility: NoteVisibility;
  book?: string;
  chapter?: string;
  page?: string;
  spoilerBoundary?: string;
  tags: string[];
  image?: NoteAttachment;
  reactions: number;
  replies: number;
  saved: boolean;
  mine?: boolean;
};

export type NotebookRecord = {
  id: string;
  name: string;
  description: string;
  type: "Public" | "Private" | "Invite-only";
  members: number;
  coverAccent: string;
  readingList: string[];
};

export type InboxThread = {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
  avatar?: string;
  kind?: "person" | "group" | "system";
  presence?: "online" | "offline";
  lastActive?: string;
};

export type PresenceReader = {
  id: string;
  name: string;
  avatar: string;
  book: string;
  nearProgress: boolean;
};
