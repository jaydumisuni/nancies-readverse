
import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  TouchEvent as ReactTouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { avatarImages, type AvatarId } from "./avatars";
import PdfBookReader from "./reader/PdfBookReader";
import UniversalReader, { type ReaderActionStatus } from "./reader/UniversalReader";
import GoogleStoragePanel from "./platform/GoogleStoragePanel";
import { useGoogleDriveSync } from "./platform/useGoogleDriveSync";
import { cacheSourceForOffline, getOfflineFile, markSnapshotUpdated, saveOfflineBlob } from "./platform/storage";
import { getGoogleAccountStatus, saveRemoteSourceToDrive, uploadBlobToDrive } from "./platform/google-client";
import SetupWizard from "./notverse/SetupWizard";
import NoTVerseViews from "./notverse/NoTVerseViews";
import { defaultNoTVersePreferences } from "./notverse/storage";
import type { NoTVerseNav, NoTVersePreferences, PresenceReader } from "./notverse/types";
import "./notverse/notverse.css";

type Gender = "woman" | "man" | "nonbinary" | "prefer_not_to_say";
type ThemeId =
  | "pink"
  | "crimson"
  | "violet"
  | "ice"
  | "emerald"
  | "orange"
  | "rose"
  | "teal";
type SettingsTab = "profile" | "companion" | "appearance" | "reader" | "storage";
type ChatRole = "companion" | "user" | "system";

type Companion = {
  id: AvatarId;
  name: string;
  series: "Jujutsu Kaisen" | "Naruto";
  gender: "male" | "female";
  summary: string;
  traits: string[];
  delivery: string;
  defaultRing: string;
  greeting: string;
  searchLine: string;
};

type Theme = {
  id: ThemeId;
  name: string;
  accent: string;
  accent2: string;
  glow: string;
  surface: string;
};

type Profile = {
  name: string;
  displayName: string;
  birthday: string;
  gender: Gender;
  pronouns: string;
  status: string;
  avatarDataUrl: string;
};

type Book = {
  id: string;
  title: string;
  subtitle: string;
  progress: number;
  genre: string;
  cover: string;
  badge?: string;
  sourceUrl?: string;
  format?: string;
  author?: string;
  language?: string;
  savedAt?: string;
  currentPage?: number;
  totalPages?: number;
  readerMode?: string;
  lastOpened?: string;
  offline?: boolean;
  driveFileId?: string;
};

type UploadItem = {
  id: string;
  name: string;
  type: string;
  sizeLabel: string;
};

type RatingSource = {
  name: string;
  sourceId: string;
  rating: number;
  ratingCount: number;
  confidence: number;
};

type PublicRating = {
  overall: number;
  ratingCount: number;
  sourceCount: number;
  sources: RatingSource[];
};

type DiscoveryCandidate = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  cover?: string;
  description?: string;
  whyMatch: string;
  provider: string;
  language?: string;
  downloadUrl?: string;
  identifiers?: Record<string, string>;
  rating?: PublicRating;
};

type SourceCandidate = {
  id: string;
  sourceUrl: string;
  directUrl?: string;
  title: string;
  format: string;
  streamUrl: string;
  temporary: true;
  domain: string;
  sizeBytes?: number;
  sizeLabel?: string;
  contentType?: string;
  author?: string;
  language?: string;
  cover?: string;
  provider?: string;
  verifiedAt?: string;
};

type SourceStage = {
  id: "source" | "file" | "metadata" | "reader";
  label: string;
  status: "waiting" | "active" | "done" | "failed";
};

type SourceCard = {
  source: SourceCandidate;
  status: "found" | "preparing" | "ready" | "failed";
  stages?: SourceStage[];
  error?: string;
};

type DiscoveryCard = {
  query: string;
  candidates: DiscoveryCandidate[];
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  upload?: UploadItem;
  sourceCard?: SourceCard;
  discovery?: DiscoveryCard;
  time: string;
};

type ReaderNote = {
  text: string;
  updatedAt: string;
};

type ReaderSource = {
  id: string;
  title: string;
  url: string;
  format: string;
  sourceUrl?: string;
  domain?: string;
  author?: string;
  language?: string;
  cover?: string;
  sizeLabel?: string;
  mimeType?: string;
  blobId?: string;
};

type ResolveSourceResponse = {
  ok: boolean;
  source?: SourceCandidate;
  sources?: SourceCandidate[];
  error?: string;
  reason?: string;
  next?: string[];
};

type DiscoveryResponse = {
  ok: boolean;
  query?: string;
  candidates?: DiscoveryCandidate[];
  error?: string;
  reason?: string;
  next?: string[];
};

const themes: Theme[] = [
  {
    id: "pink",
    name: "Pink Glow",
    accent: "#ff4fa3",
    accent2: "#ff8bd0",
    glow: "rgba(255,79,163,.42)",
    surface: "#160b13",
  },
  {
    id: "crimson",
    name: "Crimson Night",
    accent: "#ff354d",
    accent2: "#ff7a86",
    glow: "rgba(255,53,77,.42)",
    surface: "#19090c",
  },
  {
    id: "violet",
    name: "Midnight Violet",
    accent: "#9a60ff",
    accent2: "#c6a1ff",
    glow: "rgba(154,96,255,.42)",
    surface: "#100b1b",
  },
  {
    id: "ice",
    name: "Icy Blue",
    accent: "#58a8ff",
    accent2: "#a8d5ff",
    glow: "rgba(88,168,255,.42)",
    surface: "#07131c",
  },
  {
    id: "emerald",
    name: "Emerald Shadow",
    accent: "#26d69a",
    accent2: "#8df0ce",
    glow: "rgba(38,214,154,.38)",
    surface: "#071611",
  },
  {
    id: "orange",
    name: "Orange Gold",
    accent: "#ff9a3c",
    accent2: "#ffd087",
    glow: "rgba(255,154,60,.4)",
    surface: "#1a0f07",
  },
  {
    id: "rose",
    name: "Rose Gold",
    accent: "#ef7899",
    accent2: "#ffc1d0",
    glow: "rgba(239,120,153,.38)",
    surface: "#180d12",
  },
  {
    id: "teal",
    name: "Teal Night",
    accent: "#24c8c2",
    accent2: "#91f2ee",
    glow: "rgba(36,200,194,.38)",
    surface: "#061617",
  },
];

const companions: Companion[] = [
  {
    id: "gojo",
    name: "Gojo",
    series: "Jujutsu Kaisen",
    gender: "male",
    summary: "Playful, confident and impossible to ignore.",
    traits: ["Playful", "Confident", "Teasing", "Protective"],
    delivery:
      "Quick-witted and shamelessly confident. Teases gently, celebrates wins loudly, and turns useful advice into a joke without becoming careless.",
    defaultRing: "#ff4fa3",
    greeting: "There you are, pretty reader. Your shelf was getting suspiciously quiet without you.",
    searchLine: "I sent the sensible search lanes first. I kept one chaotic lane for quality control.",
  },
  {
    id: "itachi",
    name: "Itachi",
    series: "Naruto",
    gender: "male",
    summary: "Calm, observant and quietly protective.",
    traits: ["Calm", "Loyal", "Mysterious", "Observant"],
    delivery:
      "Measured and attentive. Uses subtle humour, notices patterns, and offers steady guidance without overexplaining.",
    defaultRing: "#d7354f",
    greeting: "Welcome back. I kept your place. Some things are worth protecting quietly.",
    searchLine: "I am checking each result twice. A convincing title is not the same as the right book.",
  },
  {
    id: "naruto",
    name: "Naruto",
    series: "Naruto",
    gender: "male",
    summary: "Energetic, loyal and relentlessly encouraging.",
    traits: ["Energetic", "Loyal", "Cheerful", "Brave"],
    delivery:
      "Warm, enthusiastic and motivating. Turns setbacks into challenges and treats every completed chapter like a victory.",
    defaultRing: "#ff9a3c",
    greeting: "You are back! Perfect timing. I was about to start the next chapter without you. Kidding. Mostly.",
    searchLine: "All search lanes are moving! Believe it—I will find something worth losing sleep over.",
  },
  {
    id: "kakashi",
    name: "Kakashi",
    series: "Naruto",
    gender: "male",
    summary: "Relaxed, clever and dryly funny.",
    traits: ["Relaxed", "Wise", "Laid-back", "Charming"],
    delivery:
      "Effortlessly calm with dry humour. Gives precise help, occasionally pretends not to be invested, and is always prepared.",
    defaultRing: "#67b6ff",
    greeting: "You are early. Or I am late. Either way, the book is still here.",
    searchLine: "I am checking several sources at once. Multitasking is easier when nobody asks how.",
  },
  {
    id: "megumi",
    name: "Megumi",
    series: "Jujutsu Kaisen",
    gender: "male",
    summary: "Reserved, thoughtful and quietly caring.",
    traits: ["Reserved", "Thoughtful", "Calm", "Loyal"],
    delivery:
      "Direct and thoughtful. Keeps the jokes dry, the recommendations relevant, and the attention focused on what the reader actually asked for.",
    defaultRing: "#6d72ff",
    greeting: "You came back. Good. Your unfinished chapter has been judging both of us.",
    searchLine: "I filtered the obvious noise. The remaining results might actually be useful.",
  },
  {
    id: "sasuke",
    name: "Sasuke",
    series: "Naruto",
    gender: "male",
    summary: "Intense, guarded and secretly attentive.",
    traits: ["Intense", "Driven", "Guarded", "Attentive"],
    delivery:
      "Minimal words, sharp observations and restrained humour. Helps decisively and does not pretend weak results are good enough.",
    defaultRing: "#9a60ff",
    greeting: "You are back. Do not make a big deal of it. I saved your page.",
    searchLine: "The weak results are gone. I kept the ones worth your time.",
  },
  {
    id: "maki",
    name: "Maki",
    series: "Jujutsu Kaisen",
    gender: "female",
    summary: "Strong, blunt and fiercely dependable.",
    traits: ["Strong", "Blunt", "Protective", "Determined"],
    delivery:
      "Practical, direct and dryly funny. Pushes the reader forward, cuts through clutter, and does not tolerate bad recommendations.",
    defaultRing: "#36d78b",
    greeting: "Finally. Pick a book before I start reorganising this shelf myself.",
    searchLine: "I removed the useless results. You are welcome.",
  },
  {
    id: "nobara",
    name: "Nobara",
    series: "Jujutsu Kaisen",
    gender: "female",
    summary: "Bold, stylish and delightfully sharp.",
    traits: ["Bold", "Sassy", "Fearless", "Stylish"],
    delivery:
      "Confident, expressive and funny. Gives strong opinions, protects the reader from ugly interfaces, and treats good taste as a basic requirement.",
    defaultRing: "#ff4f78",
    greeting: "There you are. The shelf was cute, but it clearly needed us.",
    searchLine: "I found options. Some have plot. One even has taste.",
  },
  {
    id: "hinata",
    name: "Hinata",
    series: "Naruto",
    gender: "female",
    summary: "Gentle, supportive and quietly brave.",
    traits: ["Gentle", "Sweet", "Supportive", "Loyal"],
    delivery:
      "Soft, encouraging and attentive. Keeps humour warm, celebrates progress, and makes the reader feel comfortable asking for help.",
    defaultRing: "#b78cff",
    greeting: "Welcome back. I kept everything ready for you. We can continue whenever you feel like it.",
    searchLine: "I am checking carefully. I want the result to feel right, not merely close.",
  },
  {
    id: "sakura",
    name: "Sakura",
    series: "Naruto",
    gender: "female",
    summary: "Caring, practical and confidently direct.",
    traits: ["Caring", "Fiery", "Practical", "Strong"],
    delivery:
      "Warm but no-nonsense. Explains clearly, catches mistakes early, and uses lively humour when the app or source is being difficult.",
    defaultRing: "#ff7da7",
    greeting: "Good, you are here. I have your page, your notes and exactly zero patience for broken links.",
    searchLine: "I am checking the results properly. We are not accepting the first pretty cover.",
  },
  {
    id: "temari",
    name: "Temari",
    series: "Naruto",
    gender: "female",
    summary: "Strategic, confident and sharply witty.",
    traits: ["Strategic", "Confident", "Witty", "Direct"],
    delivery:
      "Efficient and composed with sharp humour. Prioritises strong sources, explains the plan, and dislikes wasted time.",
    defaultRing: "#f2b643",
    greeting: "You are back. Excellent. Let us make one good decision before the rest of the internet complicates it.",
    searchLine: "The sources are ranked, the lanes are assigned, and the slow ones know they are replaceable.",
  },
  {
    id: "mei",
    name: "Mei Mei",
    series: "Jujutsu Kaisen",
    gender: "female",
    summary: "Elegant, calm and calculating.",
    traits: ["Elegant", "Calm", "Calculating", "Witty"],
    delivery:
      "Polished and observant. Frames choices clearly, appreciates efficient systems, and keeps the humour elegant with a hint of mischief.",
    defaultRing: "#72d3ff",
    greeting: "Welcome back. Your time is valuable, so I kept only the interesting options.",
    searchLine: "I am comparing quality, source reliability and effort. Even recommendations should justify their cost.",
  },
];

const starterBooks: Book[] = [
  {
    id: "solo",
    title: "Solo Leveling",
    subtitle: "Vol. 12",
    progress: 68,
    genre: "Fantasy",
    cover: avatarImages.megumi,
  },
  {
    id: "one-piece",
    title: "One Piece",
    subtitle: "Chapter 1102",
    progress: 34,
    genre: "Adventure",
    cover: avatarImages.naruto,
  },
  {
    id: "demon",
    title: "Demon Slayer",
    subtitle: "Vol. 23",
    progress: 82,
    genre: "Action",
    cover: avatarImages.itachi,
  },
  {
    id: "blessing",
    title: "The Blessing",
    subtitle: "After the End",
    progress: 26,
    genre: "Fantasy",
    cover: avatarImages.gojo,
  },
];

const recentBooks: Book[] = [
  {
    id: "chainsaw",
    title: "Chainsaw Man",
    subtitle: "Vol. 16",
    progress: 0,
    genre: "Action",
    cover: avatarImages.nobara,
    badge: "New",
  },
  {
    id: "jjk",
    title: "Jujutsu Kaisen",
    subtitle: "Vol. 24",
    progress: 0,
    genre: "Supernatural",
    cover: avatarImages.gojo,
    badge: "New",
  },
  {
    id: "naruto-read",
    title: "Naruto",
    subtitle: "Vol. 29",
    progress: 0,
    genre: "Adventure",
    cover: avatarImages.naruto,
    badge: "New",
  },
  {
    id: "blue-lock",
    title: "Blue Lock",
    subtitle: "Vol. 21",
    progress: 0,
    genre: "Sports",
    cover: avatarImages.sasuke,
    badge: "New",
  },
];

const defaultProfile: Profile = {
  name: "Nancy",
  displayName: "Nancy",
  birthday: "2003-05-21",
  gender: "woman",
  pronouns: "she/her",
  status: "Books are my escape and stories are my home. 💗",
  avatarDataUrl: "",
};

const defaultRingColors = Object.fromEntries(
  companions.map((companion) => [companion.id, companion.defaultRing]),
) as Record<AvatarId, string>;

function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
    markSnapshotUpdated();
    window.dispatchEvent(new Event("readverse:state-changed"));
  }, [key, value]);

  return [value, setValue] as const;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timeNow() {
  return new Intl.DateTimeFormat("en-ZM", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Icon({
  name,
  size = 20,
}: {
  name:
    | "home"
    | "book"
    | "search"
    | "heart"
    | "clock"
    | "sparkle"
    | "user"
    | "settings"
    | "note"
    | "download"
    | "upload"
    | "send"
    | "close"
    | "expand"
    | "chevron"
    | "bookmark"
    | "palette"
    | "cloud"
    | "paperclip"
    | "menu"
    | "arrow";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<string, React.ReactElement> = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22Z" /><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22Z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    sparkle: <><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8Z" /><path d="m19 15 .7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9Z" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    note: <><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>,
    upload: <><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M4 3h16" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    expand: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
    palette: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3a6 6 0 0 0 0-12Z" /><circle cx="7.5" cy="10" r=".7" /><circle cx="9" cy="6.5" r=".7" /><circle cx="14" cy="6.5" r=".7" /></>,
    cloud: <><path d="M17.5 19H6a4 4 0 0 1-.7-7.9A7 7 0 0 1 19 9.5a4.5 4.5 0 0 1-1.5 9.5Z" /><path d="m9 14 3-3 3 3M12 11v6" /></>,
    paperclip: <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

export default function App() {
  const [profile, setProfile] = useStoredState<Profile>("readverse.profile", defaultProfile);
  const [themeId, setThemeId] = useStoredState<ThemeId>("readverse.theme", "pink");
  const [selectedCompanionId, setSelectedCompanionId] = useStoredState<AvatarId>(
    "readverse.companion",
    "gojo",
  );
  const [ringColors, setRingColors] = useStoredState<Record<AvatarId, string>>(
    "readverse.ring-colors",
    defaultRingColors,
  );
  const [notes, setNotes] = useStoredState<Record<string, ReaderNote>>(
    "readverse.notes",
    {},
  );
  const [libraryBooks, setLibraryBooks] = useStoredState<Book[]>(
    "readverse.library",
    starterBooks,
  );
  const [messages, setMessages] = useStoredState<ChatMessage[]>(
    "readverse.chat",
    [],
  );
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("companion");
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerFullscreen, setReaderFullscreen] = useState(false);
  const [readerPage, setReaderPage] = useState(186);
  const [pageTurning, setPageTurning] = useState<"next" | "previous" | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [nudgeVisible, setNudgeVisible] = useState(true);
  const [activeSection, setActiveSection] = useState<NoTVerseNav>("home");
  const [notversePreferences, setNoTVersePreferences] = useStoredState<NoTVersePreferences>("notverse.preferences", defaultNoTVersePreferences);
  const [readerSource, setReaderSource] = useState<ReaderSource | null>(null);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceResolving, setSourceResolving] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [pendingSource, setPendingSource] = useState<SourceCandidate | null>(null);
  const [rejectedCandidates, setRejectedCandidates] = useStoredState<string[]>("readverse.rejected-discovery", []);
  const fileInputRef = useRef<HTMLInputElement>(null!);
  const readerRef = useRef<HTMLDivElement>(null!);
  const sessionFileUrls = useRef<Map<string, string>>(new Map());
  const sessionFileBlobs = useRef<Map<string, Blob>>(new Map());
  const [offlineStatus, setOfflineStatus] = useState<Record<string, ReaderActionStatus>>({});
  const [driveStatus, setDriveStatus] = useState<Record<string, ReaderActionStatus>>({});
  useGoogleDriveSync();

  const theme = themes.find((item) => item.id === themeId) ?? themes[0];
  const companion =
    companions.find((item) => item.id === selectedCompanionId) ?? companions[0];
  const ringColor = ringColors[companion.id] ?? companion.defaultRing;
  const presenceReaders = useMemo<PresenceReader[]>(() => companions.slice(0, 8).map((item, index) => ({
    id: `presence-${item.id}`,
    name: item.name,
    avatar: avatarImages[item.id],
    book: libraryBooks[index % Math.max(1, libraryBooks.length)]?.title || "One Piece",
    nearProgress: index < 4,
  })), [libraryBooks]);

  const companionMessages = useMemo(() => {
    if (messages.length > 0) return messages;
    return [
      {
        id: "welcome",
        role: "companion" as const,
        text: companion.greeting,
        time: timeNow(),
      },
    ];
  }, [messages, companion.greeting]);

  useEffect(() => () => {
    for (const url of sessionFileUrls.current.values()) URL.revokeObjectURL(url);
    sessionFileUrls.current.clear();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-2", theme.accent2);
    root.style.setProperty("--accent-glow", theme.glow);
    root.style.setProperty("--theme-surface", theme.surface);
    root.style.setProperty("--companion-ring", ringColor);
  }, [theme, ringColor]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: uid("welcome"),
          role: "companion",
          text: companion.greeting,
          time: timeNow(),
        },
      ]);
    }
  }, []);

  useEffect(() => {
    setNudgeVisible(true);
    const timer = window.setTimeout(() => setNudgeVisible(false), 7500);
    return () => window.clearTimeout(timer);
  }, [selectedCompanionId]);

  useEffect(() => {
    if (activeSection !== "home") setChatOpen(false);
  }, [activeSection]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning, ${profile.displayName || profile.name}`;
    if (hour < 18) return `Good afternoon, ${profile.displayName || profile.name}`;
    return `Good evening, ${profile.displayName || profile.name}`;
  }, [profile.displayName, profile.name]);

  function updateCompanion(id: AvatarId) {
    const next = companions.find((item) => item.id === id);
    if (!next) return;
    setSelectedCompanionId(id);
    setMessages([
      {
        id: uid("switch"),
        role: "companion",
        text: next.greeting,
        time: timeNow(),
      },
    ]);
  }

  async function askCompanion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || sending) return;

    const userMessage: ChatMessage = {
      id: uid("user"),
      role: "user",
      text: cleanQuestion,
      time: timeNow(),
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setSending(true);

    const lower = cleanQuestion.toLowerCase();
    const directUrl = extractFirstHttpUrl(cleanQuestion);

    if (pendingSource && isPrepareFollowUp(cleanQuestion)) {
      await prepareSource(pendingSource);
      setSending(false);
      return;
    }

    if (directUrl) {
      setSearching(true);
      setMessages((current) => [
        ...current,
        {
          id: uid("source-checking"),
          role: "companion",
          text: characterise(companion, "Lemme get that for you. I am checking the source, following the public route and verifying the actual reading file."),
          time: timeNow(),
        },
      ]);
      try {
        const source = await resolveSourceCandidate(directUrl);
        setPendingSource(source);
        setSourceDialogOpen(false);
        setSourceUrl("");
        setMessages((current) => [
          ...current,
          {
            id: uid("source-found"),
            role: "companion",
            text: characterise(companion, `I found it. This looks like “${source.title}”. Check the details, then tell me whether I should prepare it for reading.`),
            sourceCard: { source, status: "found" },
            time: timeNow(),
          },
        ]);
      } catch (error) {
        explainSourceFailure(error);
      } finally {
        setSearching(false);
        setSending(false);
      }
      return;
    }

    if (looksLikeDiscoveryRequest(cleanQuestion)) {
      await discoverFromMemory(cleanQuestion);
      setSending(false);
      return;
    }

    if (lower.includes("open reader") || lower.includes("continue reading")) {
      setReaderOpen(true);
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: characterise(companion, "Reader opened. Your page was exactly where you left it."),
          time: timeNow(),
        },
      ]);
      setSending(false);
      return;
    }
    if (lower.includes("setting") || lower.includes("change theme")) {
      setSettingsOpen(true);
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: characterise(companion, "Settings are open. Try not to spend twenty minutes choosing between two nearly identical shades. I will notice."),
          time: timeNow(),
        },
      ]);
      setSending(false);
      return;
    }

    try {
      const response = await fetch("/api/companion/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: cleanQuestion,
          companion: companion.name,
          vibe: `${companion.traits.join(", ")}. ${companion.delivery}`,
          history: messages.slice(-12).map((message) => ({
            role: message.role === "companion" ? "assistant" : "user",
            text: message.text,
          })),
        }),
      });
      const body = (await response.json()) as { answer?: string; error?: string };
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: body.answer ?? body.error ?? characterise(companion, "That thought escaped. Ask me once more."),
          time: timeNow(),
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: uid("reply"),
          role: "companion",
          text: localFallback(cleanQuestion, companion, messages),
          time: timeNow(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function resolveSourceCandidate(url: string): Promise<SourceCandidate> {
    const response = await fetch("/api/source/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const body = (await response.json()) as ResolveSourceResponse;
    if (!response.ok || !body.ok || !body.source) {
      throw new Error(body.reason || body.error || "NoTVerse could not resolve that source.");
    }
    return body.source;
  }

  async function discoverFromMemory(query: string, exclude = rejectedCandidates) {
    setSearching(true);
    setMessages((current) => [
      ...current,
      {
        id: uid("discovery-start"),
        role: "companion",
        text: characterise(companion, "Give me a moment. I am matching the title, story clues, cover details and likely editions instead of guessing from one word."),
        time: timeNow(),
      },
    ]);
    try {
      const response = await fetch("/api/discovery/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, exclude }),
      });
      const body = (await response.json()) as DiscoveryResponse;
      if (!response.ok || !body.ok || !body.candidates?.length) {
        const detail = body.reason || body.error || "I could not find a strong match yet.";
        const next = body.next?.[0] || "Tell me one more detail: a character, cover colour, author, year, or part of the title.";
        setMessages((current) => [
          ...current,
          {
            id: uid("discovery-empty"),
            role: "companion",
            text: characterise(companion, `${detail} ${next}`),
            time: timeNow(),
          },
        ]);
        return;
      }
      setMessages((current) => [
        ...current,
        {
          id: uid("discovery-results"),
          role: "companion",
          text: characterise(companion, `I found ${body.candidates!.length} likely matches. The first is strongest, but I kept alternatives because “close enough” is how the wrong book wins.`),
          discovery: { query: body.query || query, candidates: body.candidates! },
          time: timeNow(),
        },
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Discovery search failed.";
      setMessages((current) => [
        ...current,
        {
          id: uid("discovery-failed"),
          role: "companion",
          text: characterise(companion, `I could not finish the search because ${reason} Give me another clue or attach the file directly; I will not leave you waiting without a next move.`),
          time: timeNow(),
        },
      ]);
    } finally {
      setSearching(false);
    }
  }

  async function selectDiscoveryCandidate(candidate: DiscoveryCandidate) {
    setSearching(true);
    setMessages((current) => [
      ...current,
      { id: uid("candidate-choice"), role: "user", text: `That is it — ${candidate.title}.`, time: timeNow() },
      { id: uid("source-hunt"), role: "companion", text: characterise(companion, "Good. I have the title now. I am checking public reading sources and verifying the actual file before I offer it."), time: timeNow() },
    ]);
    try {
      const response = await fetch("/api/discovery/source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate }),
      });
      const body = (await response.json()) as ResolveSourceResponse;
      if (!response.ok || !body.ok || !body.sources?.length) {
        const reason = body.reason || body.error || "I identified the book, but no accessible reading file passed verification.";
        const next = body.next?.join(" ") || "You can give me another source, upload your copy, or ask me to search another edition.";
        setMessages((current) => [
          ...current,
          { id: uid("source-none"), role: "companion", text: characterise(companion, `${reason} ${next}`), time: timeNow() },
        ]);
        return;
      }
      const source = body.sources[0];
      setPendingSource(source);
      setMessages((current) => [
        ...current,
        {
          id: uid("source-found"),
          role: "companion",
          text: characterise(companion, `I found a verified ${source.format.toUpperCase()} for “${source.title}”. Check the source details, then choose whether I should prepare it.`),
          sourceCard: { source, status: "found" },
          time: timeNow(),
        },
      ]);
    } catch (error) {
      explainSourceFailure(error, candidate.title);
    } finally {
      setSearching(false);
    }
  }

  function rejectDiscoveryCandidate(candidate: DiscoveryCandidate) {
    const nextRejected = rejectedCandidates.includes(candidate.id) ? rejectedCandidates : [...rejectedCandidates, candidate.id];
    setRejectedCandidates(nextRejected);
    setMessages((current) => [
      ...current,
      { id: uid("candidate-reject"), role: "user", text: `Not ${candidate.title}.`, time: timeNow() },
      {
        id: uid("candidate-clue"),
        role: "companion",
        text: characterise(companion, "Got it. I will not show that one again. Give me one detail that separates it: a character, cover colour, author, setting, year, or a word from the title."),
        time: timeNow(),
      },
    ]);
  }

  async function showMoreDiscovery(query: string) {
    await discoverFromMemory(query, rejectedCandidates);
  }

  function rejectSource(source: SourceCandidate) {
    setPendingSource(null);
    setMessages((current) => [
      ...current,
      { id: uid("source-reject"), role: "user", text: `That is not the right copy of ${source.title}.`, time: timeNow() },
      {
        id: uid("source-correction"),
        role: "companion",
        text: characterise(companion, "Good catch. Tell me what looked wrong—the title page, cover, language, edition, author, or content—and I will narrow the next search instead of repeating this result."),
        time: timeNow(),
      },
    ]);
  }

  function updateSourceCard(sourceId: string, updater: (card: SourceCard) => SourceCard) {
    setMessages((current) => current.map((message) => message.sourceCard?.source.id === sourceId
      ? { ...message, sourceCard: updater(message.sourceCard) }
      : message));
  }

  async function prepareSource(source: SourceCandidate) {
    if (sending || source.id !== pendingSource?.id) return;
    const stages: SourceStage[] = [
      { id: "source", label: "Verified public source", status: "done" },
      { id: "file", label: "Checking the readable file", status: "active" },
      { id: "metadata", label: "Reading document details", status: "waiting" },
      { id: "reader", label: "Preparing the temporary reader", status: "waiting" },
    ];
    updateSourceCard(source.id, (card) => ({ ...card, status: "preparing", stages }));
    setSearching(true);
    try {
      const response = await fetch(source.streamUrl, { method: "HEAD", cache: "no-store" });
      if (!response.ok) throw new Error(`the verified file returned HTTP ${response.status} while preparing`);
      updateSourceCard(source.id, (card) => ({
        ...card,
        stages: card.stages?.map((stage) => stage.id === "file" ? { ...stage, status: "done" } : stage.id === "metadata" ? { ...stage, status: "active" } : stage),
      }));
      const sizeBytes = Number(response.headers.get("content-length") || source.sizeBytes || 0);
      const prepared = { ...source, sizeBytes: sizeBytes || source.sizeBytes, sizeLabel: sizeBytes ? formatFileSize(sizeBytes) : source.sizeLabel };
      setPendingSource(prepared);
      updateSourceCard(source.id, (card) => ({
        ...card,
        source: prepared,
        stages: card.stages?.map((stage) => stage.id === "metadata" ? { ...stage, status: "done" } : stage.id === "reader" ? { ...stage, status: "active" } : stage),
      }));
      setReaderSource({
        id: prepared.id,
        title: prepared.title,
        url: prepared.streamUrl,
        format: prepared.format,
        sourceUrl: prepared.sourceUrl,
        domain: prepared.domain,
        author: prepared.author,
        language: prepared.language,
        cover: prepared.cover,
        sizeLabel: prepared.sizeLabel,
      });
      updateSourceCard(source.id, (card) => ({
        ...card,
        status: "ready",
        source: prepared,
        stages: card.stages?.map((stage) => ({ ...stage, status: "done" })),
      }));
      setMessages((current) => [
        ...current,
        {
          id: uid("source-ready"),
          role: "companion",
          text: characterise(companion, "Done. Open it and check the cover, title page and first few pages. If it is right, use Add to Library inside the reader so I keep the source and your reading record."),
          time: timeNow(),
        },
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "the file could not be prepared";
      updateSourceCard(source.id, (card) => ({
        ...card,
        status: "failed",
        error: reason,
        stages: card.stages?.map((stage) => stage.status === "active" ? { ...stage, status: "failed" } : stage),
      }));
      setMessages((current) => [
        ...current,
        { id: uid("prepare-failed"), role: "companion", text: characterise(companion, `I found the source, but preparation stopped because ${reason}. Nothing was saved. Try another source, another edition, or upload the file directly.`), time: timeNow() },
      ]);
    } finally {
      setSearching(false);
    }
  }

  function openPreparedSource(source: SourceCandidate) {
    setReaderSource({
      id: source.id,
      title: source.title,
      url: source.streamUrl,
      format: source.format,
      sourceUrl: source.sourceUrl,
      domain: source.domain,
      author: source.author,
      language: source.language,
      cover: source.cover,
      sizeLabel: source.sizeLabel,
    });
    setReaderOpen(true);
  }

  function explainSourceFailure(error: unknown, title?: string) {
    const reason = error instanceof Error ? error.message : "NoTVerse could not verify an accessible reading file.";
    setMessages((current) => [
      ...current,
      {
        id: uid("source-blocked"),
        role: "companion",
        text: characterise(companion, `${title ? `I identified “${title}”, but ` : ""}I could not prepare a reading source because ${reason} Nothing was opened or saved. Send another link, upload your copy, or give me another edition clue and I will keep looking.`),
        time: timeNow(),
      },
    ]);
  }

  function chooseMood(mood: string) {
    setQuestion(`Find something ${mood.toLowerCase()}`);
  }

  function launchNoTVerseDiscovery(query: string) {
    const clean = query.trim();
    if (!clean) return;
    setActiveSection("search");
    setChatOpen(true);
    setMessages((current) => [...current, { id: uid("notverse-search-user"), role: "user", text: clean, time: timeNow() }]);
    void discoverFromMemory(clean);
  }

  async function openNoTVerseBook(book: Pick<Book, "id" | "title" | "sourceUrl" | "format" | "author" | "offline">) {
    if (book.format) {
      const source: ReaderSource = {
        id: book.id,
        title: book.title,
        url: book.sourceUrl || "/fixtures/sample.pdf",
        format: book.format,
        sourceUrl: book.sourceUrl,
        author: book.author,
      };
      if (book.offline && await openOfflineReaderSource(source)) {
        setReaderOpen(true);
        return;
      }
      if (book.sourceUrl) {
        try {
          const resolved = await resolveSourceCandidate(book.sourceUrl);
          setReaderSource({ id: resolved.id, title: resolved.title, url: resolved.streamUrl, format: resolved.format, sourceUrl: resolved.sourceUrl, domain: resolved.domain, author: resolved.author, language: resolved.language, cover: resolved.cover, sizeLabel: resolved.sizeLabel });
          setReaderOpen(true);
          return;
        } catch (error) {
          explainSourceFailure(error, book.title);
          setChatOpen(true);
          return;
        }
      }
      setReaderSource(source);
    } else {
      setReaderSource(null);
    }
    setReaderOpen(true);
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const upload: UploadItem = {
      id: uid("file"),
      name: file.name,
      type: file.type || file.name.split(".").pop()?.toUpperCase() || "File",
      sizeLabel: formatFileSize(file.size),
    };
    const objectUrl = URL.createObjectURL(file);
    sessionFileUrls.current.set(upload.id, objectUrl);
    sessionFileBlobs.current.set(upload.id, file);

    setMessages((current) => [
      ...current,
      {
        id: uid("upload-user"),
        role: "user",
        text: "I attached this for NoTVerse.",
        upload,
        time: timeNow(),
      },
      {
        id: uid("upload-reply"),
        role: "companion",
        text: characterise(
          companion,
          `I found “${file.name}”. I can open it temporarily, add the title to your library, or keep it offline. You can open it temporarily, save it offline, add it to the library, or save the full file to Drive after connecting Google.`,
        ),
        time: timeNow(),
      },
    ]);
    setChatOpen(true);
  }

  function openUploadedFile(upload: UploadItem) {
    const url = sessionFileUrls.current.get(upload.id);
    if (!url) {
      setMessages((current) => [
        ...current,
        {
          id: uid("expired-file"),
          role: "companion",
          text: characterise(companion, "That temporary file is no longer in this browser session. Attach it again and I will open it properly."),
          time: timeNow(),
        },
      ]);
      return;
    }
    const format = upload.name.split(".").pop()?.toLowerCase() || upload.type.toLowerCase();
    setReaderSource({ id: upload.id, title: upload.name, url, format, mimeType: upload.type, blobId: upload.id });
    setReaderOpen(true);
    setMessages((current) => [
      ...current,
      {
        id: uid("read-file"),
        role: "companion",
        text: characterise(companion, `Opening “${upload.name}” in a temporary reading session. No copy was uploaded to Cloudflare. Use Save offline or Save to Drive only when you want to keep it.`),
        time: timeNow(),
      },
    ]);
  }

  async function resolveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUrl = sourceUrl.trim();
    if (!cleanUrl || sourceResolving) return;
    setSourceResolving(true);
    setSourceError("");
    setChatOpen(true);
    setMessages((current) => [
      ...current,
      { id: uid("source-user"), role: "user", text: cleanUrl, time: timeNow() },
      { id: uid("source-checking"), role: "companion", text: characterise(companion, "Lemme get that for you. I am testing the source and verifying the real reading file."), time: timeNow() },
    ]);
    try {
      const source = await resolveSourceCandidate(cleanUrl);
      setPendingSource(source);
      setSourceDialogOpen(false);
      setSourceUrl("");
      setMessages((current) => [
        ...current,
        {
          id: uid("source-found"),
          role: "companion",
          text: characterise(companion, `I found “${source.title}”. Check the details and choose Prepare to read when you are happy with the result.`),
          sourceCard: { source, status: "found" },
          time: timeNow(),
        },
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "NoTVerse could not resolve that source.";
      setSourceError(reason);
      explainSourceFailure(error);
    } finally {
      setSourceResolving(false);
    }
  }

  function addReaderSourceToLibrary(source: ReaderSource) {
    const newBook: Book = {
      id: source.id,
      title: source.title.replace(/\.[^.]+$/, ""),
      subtitle: [source.author, source.format.toUpperCase(), source.domain].filter(Boolean).join(" · "),
      progress: 0,
      genre: "Saved source",
      cover: source.cover || avatarImages[companion.id],
      badge: "Saved",
      sourceUrl: source.sourceUrl,
      format: source.format,
      author: source.author,
      language: source.language,
      savedAt: new Date().toISOString(),
      currentPage: 1,
      totalPages: 1,
      readerMode: source.format,
      lastOpened: new Date().toISOString(),
      offline: offlineStatus[source.id] === "done",
    };
    setLibraryBooks((current) => current.some((book) => book.id === newBook.id || (book.sourceUrl && book.sourceUrl === newBook.sourceUrl)) ? current : [newBook, ...current]);
    setMessages((current) => [
      ...current,
      {
        id: uid("reader-library-added"),
        role: "companion",
        text: characterise(companion, "Added to your library. I kept the title, source, reading mode and progress record. The source record and progress are now durable. Use Save offline or Save to Drive when you want the full file kept."),
        time: timeNow(),
      },
    ]);
  }

  function addUploadedToLibrary(upload: UploadItem) {
    const newBook: Book = {
      id: upload.id,
      title: upload.name.replace(/\.[^.]+$/, ""),
      subtitle: upload.type,
      progress: 0,
      genre: "Uploaded",
      cover: avatarImages[companion.id],
      badge: "Added",
    };
    setLibraryBooks((current) => {
      if (current.some((book) => book.id === newBook.id)) return current;
      return [newBook, ...current];
    });
    setMessages((current) => [
      ...current,
      {
        id: uid("library-added"),
        role: "companion",
        text: characterise(companion, "Added. Your library has one less excuse to look empty."),
        time: timeNow(),
      },
    ]);
  }

  function handleReaderProgress(progress: { page: number; totalPages: number; percent: number; mode: string }) {
    if (!readerSource) return;
    setLibraryBooks((current) => current.map((book) =>
      book.id === readerSource.id || (book.sourceUrl && readerSource.sourceUrl && book.sourceUrl === readerSource.sourceUrl)
        ? { ...book, currentPage: progress.page, totalPages: progress.totalPages, progress: progress.percent, readerMode: progress.mode, lastOpened: new Date().toISOString() }
        : book,
    ));
  }

  async function saveReaderOffline() {
    const source = readerSource;
    if (!source || offlineStatus[source.id] === "working") return;
    setOfflineStatus((current) => ({ ...current, [source.id]: "working" }));
    try {
      const localBlob = source.blobId ? sessionFileBlobs.current.get(source.blobId) : null;
      if (localBlob) {
        await saveOfflineBlob({ id: source.id, title: source.title, format: source.format, mimeType: source.mimeType || localBlob.type, blob: localBlob });
      } else {
        await cacheSourceForOffline({ id: source.id, title: source.title, url: source.url, format: source.format, mimeType: source.mimeType });
      }
      setOfflineStatus((current) => ({ ...current, [source.id]: "done" }));
      setLibraryBooks((current) => current.map((book) => book.id === source.id ? { ...book, offline: true } : book));
      setMessages((current) => [...current, { id: uid("offline-saved"), role: "companion", text: characterise(companion, `“${source.title}” is available offline on this device.`), time: timeNow() }]);
    } catch (error) {
      setOfflineStatus((current) => ({ ...current, [source.id]: "error" }));
      setMessages((current) => [...current, { id: uid("offline-error"), role: "companion", text: characterise(companion, `Offline saving stopped because ${error instanceof Error ? error.message : "the browser storage failed"}.`), time: timeNow() }]);
    }
  }

  async function saveReaderToDrive() {
    const source = readerSource;
    if (!source || driveStatus[source.id] === "working") return;
    setDriveStatus((current) => ({ ...current, [source.id]: "working" }));
    try {
      const account = await getGoogleAccountStatus();
      if (!account.connected) {
        setDriveStatus((current) => ({ ...current, [source.id]: "idle" }));
        setSettingsTab("storage");
        setSettingsOpen(true);
        throw new Error(account.configured ? "connect Google Drive first" : "the Google OAuth secrets are not configured yet");
      }
      const localBlob = source.blobId ? sessionFileBlobs.current.get(source.blobId) : null;
      const saved = localBlob
        ? await uploadBlobToDrive({ blob: localBlob, title: source.title, format: source.format })
        : await saveRemoteSourceToDrive({ sourceUrl: source.url, title: source.title, format: source.format });
      setDriveStatus((current) => ({ ...current, [source.id]: "done" }));
      setLibraryBooks((current) => current.map((book) => book.id === source.id ? { ...book, driveFileId: saved.id } : book));
      setMessages((current) => [...current, { id: uid("drive-saved"), role: "companion", text: characterise(companion, `Saved “${saved.name}” in the NoTVerse folder on Google Drive.`), time: timeNow() }]);
    } catch (error) {
      setDriveStatus((current) => ({ ...current, [source.id]: "error" }));
      setMessages((current) => [...current, { id: uid("drive-error"), role: "companion", text: characterise(companion, `Drive saving stopped because ${error instanceof Error ? error.message : "Google Drive failed"}. Nothing was silently saved.`), time: timeNow() }]);
    }
  }

  async function openOfflineReaderSource(source: ReaderSource) {
    const record = await getOfflineFile(source.id);
    if (!record) return false;
    const url = URL.createObjectURL(record.blob);
    sessionFileUrls.current.set(source.id, url);
    setReaderSource({ ...source, url, blobId: source.id, mimeType: record.mimeType });
    setOfflineStatus((current) => ({ ...current, [source.id]: "done" }));
    return true;
  }

  function turnPage(direction: "next" | "previous") {
    if (pageTurning) return;
    setPageTurning(direction);
    window.setTimeout(() => {
      setReaderPage((page) => Math.max(1, page + (direction === "next" ? 2 : -2)));
      setPageTurning(null);
    }, 430);
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await readerRef.current?.requestFullscreen();
        setReaderFullscreen(true);
      } else {
        await document.exitFullscreen();
        setReaderFullscreen(false);
      }
    } catch {
      setReaderFullscreen((current) => !current);
    }
  }

  function saveNote(value: string, readerId = "demo-reader") {
    setNotes((current) => ({
      ...current,
      [readerId]: {
        text: value,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function handleProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setProfile((current) => ({
        ...current,
        avatarDataUrl: typeof reader.result === "string" ? reader.result : "",
      }));
    };
    reader.readAsDataURL(file);
  }

  function closeMenus(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      setSettingsOpen(false);
    }
  }

  useEffect(() => {
    const routeSocialHash = () => {
      const hash = window.location.hash;
      if (hash === "#activity" || hash === "#my-notes" || hash.startsWith("#note=")) {
        setChatOpen(false);
        setActiveSection("notes");
      }
    };
    routeSocialHash();
    window.addEventListener("hashchange", routeSocialHash);
    return () => window.removeEventListener("hashchange", routeSocialHash);
  }, []);

  return (
    <div className="readverse-app notverse-app">
      <div className="cosmic-grid" />
      {!notversePreferences.setupComplete && (
        <SetupWizard
          profile={profile}
          preferences={notversePreferences}
          selectedTheme={themeId}
          selectedCompanion={selectedCompanionId}
          themes={themes}
          companions={companions.map((item) => ({ id: item.id, name: item.name, summary: item.summary, avatar: avatarImages[item.id], ring: ringColors[item.id] || item.defaultRing }))}
          onProfile={setProfile}
          onPreferences={setNoTVersePreferences}
          onTheme={(id) => setThemeId(id as ThemeId)}
          onCompanion={(id) => updateCompanion(id as AvatarId)}
          onComplete={() => { setChatOpen(false); setNoTVersePreferences((current) => ({ ...current, setupComplete: true })); }}
        />
      )}
      <aside className="sidebar">
        <a className="brand notverse-brand" href="#home" onClick={() => setActiveSection("home")} aria-label="NoTVerse Home">
          <span role="img" aria-label="NoTVerse" />
          <small className="notverse-origin">Created for Nancy.<br />Shared with the world.</small>
        </a>

        <nav className="side-nav" aria-label="Main navigation">
          {[
            ["home", "home", "Home"],
            ["search", "search", "Search"],
            ["notes", "note", "Notes"],
            ["library", "book", "Library"],
            ["inbox", "send", "Inbox"],
            ["me", "user", "Me"],
          ].map(([id, icon, label]) => (
            <button
              className={activeSection === id ? "active" : ""}
              key={id}
              type="button"
              onClick={() => { setActiveSection(id as NoTVerseNav); setChatOpen(false); }}
            >
              <Icon name={icon as Parameters<typeof Icon>[0]["name"]} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <button
          className="reading-streak"
          type="button"
          onClick={() => setReaderOpen(true)}
        >
          <span><Icon name="sparkle" size={17} /> Reading streak</span>
          <strong>27 <small>days</small></strong>
          <p>Plot twist: you are the main character.</p>
          <i>View stats <Icon name="arrow" size={16} /></i>
        </button>

        <button
          className="profile-chip"
          type="button"
          onClick={() => {
            setSettingsTab("profile");
            setSettingsOpen(true);
          }}
        >
          <ProfileAvatar profile={profile} />
          <span>
            <strong>{profile.displayName || profile.name}</strong>
            <small>Pretty reader ✨</small>
          </span>
          <Icon name="chevron" size={17} />
        </button>
      </aside>

      <main className={`main-shell notverse-shell ${chatOpen ? "with-chat" : ""}`}>
        <header className="utility-bar">
          <div className="mobile-brand"><span role="img" aria-label="NoTVerse" /></div>
          <label className="global-search">
            <Icon name="search" size={18} />
            <input
              placeholder="Search books, manga, comics, PDFs…"
              onFocus={() => setActiveSection("search")}
            />
            <kbd>⌘ K</kbd>
          </label>
          <div className="utility-actions">
            <button type="button" className="activity-button" aria-label="Notifications" onClick={() => { setChatOpen(false); setActiveSection("notes"); window.location.hash = "activity"; }}>♡</button>
            <button
              type="button"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Icon name="settings" size={19} />
            </button>
            <button
              type="button"
              className="avatar-button"
              onClick={() => {
                setSettingsTab("profile");
                setSettingsOpen(true);
              }}
            >
              <ProfileAvatar profile={profile} />
            </button>
          </div>
        </header>

        <NoTVerseViews
          active={activeSection}
          displayName={profile.displayName || profile.name}
          avatar={profile.avatarDataUrl}
          status={profile.status}
          greeting={greeting}
          companion={{ name: companion.name, avatar: avatarImages[companion.id], ring: ringColor, summary: companion.summary }}
          books={libraryBooks}
          preferences={notversePreferences}
          presence={presenceReaders}
          onDiscover={launchNoTVerseDiscovery}
          onSource={() => { setSourceError(""); setSourceDialogOpen(true); }}
          onUpload={() => fileInputRef.current?.click()}
          onChat={() => setChatOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onMyNotes={() => { setChatOpen(false); setActiveSection("notes"); window.location.hash = "my-notes"; }}
          onOpenBook={openNoTVerseBook}
        />

        <button
          className="floating-companion"
          style={{ "--ring": ringColor } as React.CSSProperties}
          type="button"
          onClick={() => {
            setNudgeVisible(false);
            setChatOpen(true);
          }}
          aria-label={`Chat with ${companion.name}`}
        >
          <img src={avatarImages[companion.id]} alt="" />
          <span className="online-dot" />
          {nudgeVisible && <i>I&apos;m ready when you are, pretty reader. 💗</i>}
        </button>
      </main>

      {createPortal(
        <CompanionPanel
          companion={companion}
          ringColor={ringColor}
          open={chatOpen}
          messages={companionMessages}
          question={question}
          sending={sending}
          searching={searching}
          onClose={() => setChatOpen(false)}
          onSubmit={askCompanion}
          onQuestionChange={setQuestion}
          onAttach={() => fileInputRef.current?.click()}
          onMood={chooseMood}
          onReadUpload={openUploadedFile}
          onAddUpload={addUploadedToLibrary}
          onPrepareSource={prepareSource}
          onOpenSource={openPreparedSource}
          onRejectSource={rejectSource}
          onSelectDiscovery={selectDiscoveryCandidate}
          onRejectDiscovery={rejectDiscoveryCandidate}
          onMoreDiscovery={showMoreDiscovery}
        />,
        document.body,
      )}

      <input
        className="visually-hidden"
        ref={fileInputRef}
        type="file"
        accept=".pdf,.epub,.cbz,.txt,.html,image/*"
        onChange={handleFileUpload}
      />

      {sourceDialogOpen && (
        <SourceDialog
          value={sourceUrl}
          resolving={sourceResolving}
          error={sourceError}
          onValue={setSourceUrl}
          onSubmit={resolveSource}
          onClose={() => setSourceDialogOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          activeTab={settingsTab}
          companion={companion}
          profile={profile}
          ringColor={ringColor}
          ringColors={ringColors}
          selectedCompanionId={selectedCompanionId}
          themeId={themeId}
          onBackdrop={closeMenus}
          onClose={() => setSettingsOpen(false)}
          onTab={setSettingsTab}
          onProfile={setProfile}
          onPhoto={handleProfilePhoto}
          onCompanion={updateCompanion}
          onRing={(id, color) =>
            setRingColors((current) => ({ ...current, [id]: color }))
          }
          onTheme={setThemeId}
        />
      )}

      {readerOpen && (
        <ReaderModal
          open
          fullscreen={readerFullscreen}
          note={notes[readerSource?.id ?? "demo-reader"]?.text ?? ""}
          notesOpen={notesOpen}
          page={readerPage}
          pageTurning={pageTurning}
          readerRef={readerRef}
          source={readerSource}
          onClose={() => setReaderOpen(false)}
          onFullscreen={toggleFullscreen}
          onNext={() => turnPage("next")}
          onPrevious={() => turnPage("previous")}
          onNotes={() => setNotesOpen((current) => !current)}
          onNoteChange={(value) => saveNote(value, readerSource?.id ?? "demo-reader")}
          onCloseNotes={() => setNotesOpen(false)}
          inLibrary={Boolean(readerSource && libraryBooks.some((book) => book.id === readerSource.id || (book.sourceUrl && book.sourceUrl === readerSource.sourceUrl)))}
          onAddToLibrary={() => readerSource && addReaderSourceToLibrary(readerSource)}
          offlineStatus={readerSource ? offlineStatus[readerSource.id] || "idle" : "idle"}
          driveStatus={readerSource ? driveStatus[readerSource.id] || "idle" : "idle"}
          onSaveOffline={saveReaderOffline}
          onSaveToDrive={saveReaderToDrive}
          onProgress={handleReaderProgress}
        />
      )}

      <nav className="mobile-nav notverse-mobile-nav" aria-label="Mobile navigation">
        {[
          ["home", "home", "Home"],
          ["search", "search", "Search"],
          ["notes", "note", "Notes"],
          ["library", "book", "Library"],
          ["inbox", "send", "Inbox"],
          ["me", "user", "Me"],
        ].map(([id, icon, label]) => (
          <button
            type="button"
            key={id}
            className={activeSection === id ? "active" : ""}
            onClick={() => { setActiveSection(id as NoTVerseNav); setChatOpen(false); }}
          >
            <Icon name={icon as Parameters<typeof Icon>[0]["name"]} size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function characterise(companion: Companion, line: string) {
  const touches: Partial<Record<AvatarId, string>> = {
    gojo: `${line} Obviously I handled it beautifully.`,
    itachi: `${line} Quietly. Properly.`,
    naruto: `${line} That counts as a win.`,
    kakashi: `${line} Try to look surprised.`,
    megumi: `${line} It was the sensible option.`,
    sasuke: `${line} Do not overthink it.`,
    maki: `${line} Easy.`,
    nobara: `${line} Good taste survives another day.`,
    hinata: `${line} We can take it one page at a time.`,
    sakura: `${line} And yes, I checked it twice.`,
    temari: `${line} Efficient. As it should be.`,
    mei: `${line} A worthwhile use of our time.`,
  };
  return touches[companion.id] ?? line;
}

function extractFirstHttpUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.;!?]+$/, "") : null;
}

function lastSourceUrl(messages: ChatMessage[]): string | null {
  for (const message of [...messages].reverse()) {
    const url = extractFirstHttpUrl(message.text);
    if (url) return url;
  }
  return null;
}

function isSourceFollowUp(value: string) {
  return /^(?:ok(?:ay)?[,.!]?\s*)?(?:let me have it|lemme have it|open it|test it|try it|check it|read it|go ahead|proceed|yes|do it)[.!?]*$/i.test(value.trim());
}

function isPrepareFollowUp(value: string) {
  return /^(?:ok(?:ay)?[,.!]?\s*)?(?:prepare it|prepare to read|let me have it|lemme have it|go ahead|proceed|yes|do it)[.!?]*$/i.test(value.trim());
}

function looksLikeDiscoveryRequest(value: string) {
  const clean = value.toLowerCase();
  return /(?:help me find|find me|search for|looking for|trying to remember|can(?:not|'t) remember|what(?:'s| is) the (?:book|manga|comic|novel)|title of|book called)/i.test(clean)
    || /\b(book|manga|comic|novel|story|magazine)\b.{0,80}\b(about|where|with|called|remember|cover|character|author)\b/i.test(clean);
}

function localFallback(question: string, companion: Companion, history: ChatMessage[] = []) {
  const value = question.trim().toLowerCase();
  if (/^(hi|hey|hello|yo|sup|good morning|good afternoon|good evening)[.!?]*$/.test(value)) {
    return characterise(companion, "Hey. I am here. Talk to me normally or drop a reading link and I will test it.");
  }
  if (/how are you|you good|what's up|whats up/.test(value)) {
    return characterise(companion, "I am good—and paying attention. What is on your mind?");
  }
  if (/^(thanks|thank you|nice|cool|great|perfect)[.!?]*$/.test(value)) {
    return characterise(companion, "You are welcome. Keep going.");
  }
  if (/what can you do|help me|capable/.test(value)) {
    return characterise(companion, "I can hold a normal conversation, test a public reading link, explain the exact blocker when one fails, open verified files, search your reading options and control the reader.");
  }
  if (extractFirstHttpUrl(question)) {
    return characterise(companion, "I found the link. I will test the actual source and either open the verified reading file or tell you the exact point where it failed.");
  }
  if (value.includes("source") || value.includes("link") || value.includes("url")) {
    return characterise(companion, "Paste the link directly into chat. I will inspect redirects and public file candidates, then open a verified reading file or report the exact blocker.");
  }
  if (value.includes("save") || value.includes("drive")) {
    return characterise(companion, "Read Now stays temporary. Add to Library keeps the record and progress. Save to Drive will keep the full file after Google is connected.");
  }
  if (value.includes("pdf") || value.includes("upload")) {
    return characterise(companion, "Attach the file or paste its public link. I will test it first, then open it in the reader.");
  }
  if (value.includes("theme") || value.includes("colour") || value.includes("color")) {
    return characterise(companion, "Theme colour and companion ring colour are separate. Settings lets you change either without forcing the other to follow.");
  }
  const previous = [...history].reverse().find((message) => message.role === "user" && message.text.trim());
  if (previous) {
    return characterise(companion, "I am following the conversation. Say what you want me to do next, and I will act on the last clear request instead of resetting to a generic help line.");
  }
  return characterise(companion, "I am listening. Talk to me normally, ask about a book, or paste a source for me to test.");
}

function ProfileAvatar({ profile }: { profile: Profile }) {
  if (profile.avatarDataUrl) {
    return <img className="profile-photo" src={profile.avatarDataUrl} alt="" />;
  }
  return (
    <span className="profile-initial">
      {(profile.displayName || profile.name || "N").slice(0, 1).toUpperCase()}
    </span>
  );
}

function SectionHeader({ title, action }: { title: string; action: string }) {
  return (
    <header className="section-title">
      <h2>{title}</h2>
      <button type="button">
        {action} <Icon name="arrow" size={15} />
      </button>
    </header>
  );
}

function BookCard({
  book,
  compact = false,
  onOpen,
}: {
  book: Book;
  compact?: boolean;
  onOpen: () => void;
}) {
  return (
    <button className={`book-card ${compact ? "compact" : ""}`} type="button" onClick={onOpen}>
      <span className="book-cover">
        <img src={book.cover} alt="" />
        {book.badge && <i>{book.badge}</i>}
        {!compact && <b>{book.progress}%</b>}
      </span>
      <strong>{book.title}</strong>
      <small>{book.subtitle}</small>
      {!compact && (
        <span className="progress-track">
          <i style={{ width: `${book.progress}%` }} />
        </span>
      )}
    </button>
  );
}


function DiscoveryResults({ card, onSelect, onReject, onMore }: {
  card: DiscoveryCard;
  onSelect: (candidate: DiscoveryCandidate) => void;
  onReject: (candidate: DiscoveryCandidate) => void;
  onMore: (query: string) => void;
}) {
  return (
    <div className="discovery-results-card">
      {card.candidates.map((candidate) => (
        <article className="discovery-result" key={candidate.id}>
          <span className="discovery-cover">
            {candidate.cover ? <img src={candidate.cover} alt="" /> : <b>{candidate.title.slice(0, 1)}</b>}
          </span>
          <div className="discovery-copy">
            <strong>{candidate.title}</strong>
            <small>{candidate.authors.join(", ") || "Unknown creator"}{candidate.year ? ` · ${candidate.year}` : ""}</small>
            {candidate.description && <p>{candidate.description}</p>}
            {candidate.rating && (
              <div className="public-rating" aria-label={`${candidate.rating.overall} out of 5 from ${candidate.rating.ratingCount} ratings across public sources`}>
                <strong><span aria-hidden="true">★</span>{candidate.rating.overall.toFixed(2)}</strong>
                <small>{candidate.rating.ratingCount.toLocaleString()} rating{candidate.rating.ratingCount === 1 ? "" : "s"} across public sources</small>
                <em>{candidate.rating.sources.map((source) => source.name).join(" + ")}</em>
              </div>
            )}
            <i>{candidate.whyMatch}</i>
            <div className="discovery-actions">
              <button type="button" onClick={() => onSelect(candidate)}>That&apos;s it</button>
              <button type="button" onClick={() => onReject(candidate)}>Not this one</button>
            </div>
          </div>
        </article>
      ))}
      <button className="show-more-discovery" type="button" onClick={() => onMore(card.query)}>Show more matches</button>
    </div>
  );
}

function SourceResultCard({ card, onPrepare, onOpen, onReject }: {
  card: SourceCard;
  onPrepare: (source: SourceCandidate) => void;
  onOpen: (source: SourceCandidate) => void;
  onReject: (source: SourceCandidate) => void;
}) {
  const source = card.source;
  return (
    <div className={`source-result-card status-${card.status}`}>
      <header>
        <span>{source.format.toUpperCase()}</span>
        <div><strong>{source.title}</strong><small>{source.domain}</small></div>
        <i>{card.status === "ready" ? "Ready" : card.status === "preparing" ? "Preparing" : card.status === "failed" ? "Stopped" : "Verified"}</i>
      </header>
      <dl>
        {source.author && <><dt>Author</dt><dd>{source.author}</dd></>}
        {source.language && <><dt>Language</dt><dd>{source.language}</dd></>}
        <dt>Format</dt><dd>{source.format.toUpperCase()}</dd>
        {source.sizeLabel && <><dt>Size</dt><dd>{source.sizeLabel}</dd></>}
        <dt>Storage</dt><dd>Temporary until you save it</dd>
      </dl>
      {card.stages && (
        <div className="source-stages">
          {card.stages.map((stage) => <span className={stage.status} key={stage.id}><i />{stage.label}</span>)}
        </div>
      )}
      {card.error && <p className="source-card-error">{card.error}</p>}
      <div className="source-card-actions">
        {card.status === "found" && <button type="button" onClick={() => onPrepare(source)}>Prepare to read</button>}
        {card.status === "ready" && <button type="button" onClick={() => onOpen(source)}>Open and read</button>}
        {card.status !== "preparing" && <button type="button" className="secondary" onClick={() => onReject(source)}>Not the right one</button>}
      </div>
    </div>
  );
}

function CompanionPanel({
  companion,
  ringColor,
  open,
  messages,
  question,
  sending,
  searching,
  onClose,
  onSubmit,
  onQuestionChange,
  onAttach,
  onMood,
  onReadUpload,
  onAddUpload,
  onPrepareSource,
  onOpenSource,
  onRejectSource,
  onSelectDiscovery,
  onRejectDiscovery,
  onMoreDiscovery,
}: {
  companion: Companion;
  ringColor: string;
  open: boolean;
  messages: ChatMessage[];
  question: string;
  sending: boolean;
  searching: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQuestionChange: (value: string) => void;
  onAttach: () => void;
  onMood: (mood: string) => void;
  onReadUpload: (upload: UploadItem) => void;
  onAddUpload: (upload: UploadItem) => void;
  onPrepareSource: (source: SourceCandidate) => void;
  onOpenSource: (source: SourceCandidate) => void;
  onRejectSource: (source: SourceCandidate) => void;
  onSelectDiscovery: (candidate: DiscoveryCandidate) => void;
  onRejectDiscovery: (candidate: DiscoveryCandidate) => void;
  onMoreDiscovery: (query: string) => void;
}) {
  return (
    <aside className={`companion-panel ${open ? "open" : ""}`}>
      <header className="companion-header">
        <span
          className="companion-avatar"
          style={{ "--ring": ringColor } as React.CSSProperties}
        >
          <img src={avatarImages[companion.id]} alt="" />
          <i />
        </span>
        <div>
          <strong>{companion.name}</strong>
          <small>{companion.summary}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close chat">
          <Icon name="close" size={21} />
        </button>
      </header>

      <div className="chat-body">
        {messages.map((message) => (
          <div className={`message-row ${message.role}`} key={message.id}>
            {message.role === "companion" && (
              <img src={avatarImages[companion.id]} alt="" />
            )}
            <div className="message-bubble">
              <p>{message.text}</p>
              {message.upload && (
                <div className="upload-card">
                  <span className="file-mark">
                    {message.upload.name.toLowerCase().endsWith(".pdf") ? "PDF" : "FILE"}
                  </span>
                  <div>
                    <strong>{message.upload.name}</strong>
                    <small>{message.upload.sizeLabel} · {message.upload.type}</small>
                  </div>
                  <div className="upload-actions">
                    <button type="button" onClick={() => onReadUpload(message.upload!)}>
                      Read now
                    </button>
                    <button type="button" onClick={() => onAddUpload(message.upload!)}>
                      Add
                    </button>
                  </div>
                </div>
              )}
              {message.discovery && <DiscoveryResults card={message.discovery} onSelect={onSelectDiscovery} onReject={onRejectDiscovery} onMore={onMoreDiscovery} />}
              {message.sourceCard && <SourceResultCard card={message.sourceCard} onPrepare={onPrepareSource} onOpen={onOpenSource} onReject={onRejectSource} />}
              <time>{message.time}</time>
            </div>
          </div>
        ))}

        {messages.length <= 2 && (
          <div className="mood-chips">
            <button type="button" onClick={() => onMood("sweet and heartwarming")}>
              💗 Sweet & Heartwarming
            </button>
            <button type="button" onClick={() => onMood("dark and mysterious")}>
              🌙 Dark & Mysterious
            </button>
            <button type="button" onClick={() => onMood("fierce and epic")}>
              ⚔ Fierce & Epic
            </button>
          </div>
        )}

        {(sending || searching) && (
          <div className="message-row companion">
            <img src={avatarImages[companion.id]} alt="" />
            <div className="typing-bubble">
              <i /><i /><i />
              <span>{searching ? "Search lanes are moving…" : `${companion.name} is thinking…`}</span>
            </div>
          </div>
        )}
      </div>

      <form className="chat-input" onSubmit={onSubmit}>
        <button type="button" onClick={onAttach} aria-label="Attach file">
          <Icon name="paperclip" size={20} />
        </button>
        <input
          value={question}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onQuestionChange(event.target.value)}
          placeholder={`Ask ${companion.name} anything…`}
          maxLength={1000}
        />
        <button type="submit" className="send-button" disabled={!question.trim() || sending}>
          <Icon name="send" size={19} />
        </button>
      </form>
    </aside>
  );
}

function SourceDialog({
  value,
  resolving,
  error,
  onValue,
  onSubmit,
  onClose,
}: {
  value: string;
  resolving: boolean;
  error: string;
  onValue: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop source-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="source-dialog">
        <header>
          <div>
            <span className="kicker">Temporary source</span>
            <h2>Open a reading link</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close source dialog">
            <Icon name="close" size={21} />
          </button>
        </header>
        <p>Paste a public PDF, EPUB, CBZ or TXT link, or a page containing an accessible reading file. NoTVerse verifies it before opening it and keeps no permanent Cloudflare copy.</p>
        <form onSubmit={onSubmit}>
          <label>
            Source URL
            <input
              type="url"
              value={value}
              onChange={(event) => onValue(event.target.value)}
              placeholder="https://example.com/book.pdf"
              required
              autoFocus
            />
          </label>
          {error && <div className="source-error">{error}</div>}
          <button className="source-submit" type="submit" disabled={resolving || !value.trim()}>
            {resolving ? "Verifying source…" : "Verify and open"}
          </button>
        </form>
      </section>
    </div>
  );
}

function SettingsModal({
  activeTab,
  companion,
  profile,
  ringColor,
  ringColors,
  selectedCompanionId,
  themeId,
  onBackdrop,
  onClose,
  onTab,
  onProfile,
  onPhoto,
  onCompanion,
  onRing,
  onTheme,
}: {
  activeTab: SettingsTab;
  companion: Companion;
  profile: Profile;
  ringColor: string;
  ringColors: Record<AvatarId, string>;
  selectedCompanionId: AvatarId;
  themeId: ThemeId;
  onBackdrop: (event: MouseEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onTab: (tab: SettingsTab) => void;
  onProfile: React.Dispatch<React.SetStateAction<Profile>>;
  onPhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  onCompanion: (id: AvatarId) => void;
  onRing: (id: AvatarId, color: string) => void;
  onTheme: (id: ThemeId) => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onBackdrop}>
      <section className="settings-modal">
        <header>
          <div>
            <span className="kicker">Make it yours</span>
            <h2>NoTVerse Settings</h2>
          </div>
          <button type="button" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </header>

        <div className="settings-layout">
          <nav>
            {[
              ["profile", "user", "Profile"],
              ["companion", "sparkle", "Companion"],
              ["appearance", "palette", "Appearance"],
              ["reader", "book", "Reader"],
              ["storage", "cloud", "Storage & Sync"],
            ].map(([id, icon, label]) => (
              <button
                type="button"
                key={id}
                className={activeTab === id ? "active" : ""}
                onClick={() => onTab(id as SettingsTab)}
              >
                <Icon name={icon as Parameters<typeof Icon>[0]["name"]} size={18} />
                {label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {activeTab === "profile" && (
              <div className="settings-pane profile-pane">
                <div className="profile-editor">
                  <ProfileAvatar profile={profile} />
                  <label>
                    Change profile picture
                    <input type="file" accept="image/*" onChange={onPhoto} />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Display name
                    <input
                      value={profile.displayName}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        onProfile((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Birthday
                    <input
                      type="date"
                      value={profile.birthday}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        onProfile((current) => ({
                          ...current,
                          birthday: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Gender
                    <select
                      value={profile.gender}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        onProfile((current) => ({
                          ...current,
                          gender: event.target.value as Gender,
                        }))
                      }
                    >
                      <option value="woman">Woman</option>
                      <option value="man">Man</option>
                      <option value="nonbinary">Non-binary</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                  </label>
                  <label>
                    Pronouns
                    <input
                      value={profile.pronouns}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        onProfile((current) => ({
                          ...current,
                          pronouns: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="wide">
                    Reading status
                    <textarea
                      value={profile.status}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                        onProfile((current) => ({
                          ...current,
                          status: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            )}

            {activeTab === "companion" && (
              <div className="settings-pane">
                <div className="companion-customizer">
                  <div className="selected-companion-preview">
                    <span
                      className="large-ring"
                      style={{ "--ring": ringColor } as React.CSSProperties}
                    >
                      <img src={avatarImages[companion.id]} alt="" />
                    </span>
                    <div>
                      <span className="kicker">Selected companion</span>
                      <h3>{companion.name}</h3>
                      <p>{companion.delivery}</p>
                      <div className="trait-row">
                        {companion.traits.map((trait) => <i key={trait}>{trait}</i>)}
                      </div>
                    </div>
                  </div>

                  <div className="ring-custom">
                    <strong>Ring colour for {companion.name}</strong>
                    <div className="color-dots">
                      {[
                        "#ff4fa3",
                        "#ff354d",
                        "#9a60ff",
                        "#58a8ff",
                        "#24c8c2",
                        "#26d69a",
                        "#f2b643",
                        "#ff9a3c",
                        "#ffffff",
                      ].map((color) => (
                        <button
                          type="button"
                          key={color}
                          className={ringColor === color ? "active" : ""}
                          style={{ background: color }}
                          onClick={() => onRing(companion.id, color)}
                          aria-label={`Use ${color}`}
                        />
                      ))}
                      <label className="custom-color">
                        +
                        <input
                          type="color"
                          value={ringColor}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => onRing(companion.id, event.target.value)}
                        />
                      </label>
                    </div>
                    <small>
                      Each companion remembers a separate ring colour. The site theme stays independent.
                    </small>
                  </div>
                </div>

                <div className="roster-heading">
                  <div>
                    <span className="kicker">Choose your companion</span>
                    <h3>Six male · six female · twelve different vibes</h3>
                  </div>
                </div>

                <div className="companion-roster">
                  {companions.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={selectedCompanionId === item.id ? "active" : ""}
                      onClick={() => onCompanion(item.id)}
                    >
                      <span
                        style={{ "--ring": ringColors[item.id] } as React.CSSProperties}
                      >
                        <img src={avatarImages[item.id]} alt="" />
                      </span>
                      <strong>{item.name}</strong>
                      <small>{item.traits.slice(0, 2).join(" · ")}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="settings-pane">
                <span className="kicker">Theme colour</span>
                <h3>Pick the colour of the world, not the companion.</h3>
                <div className="theme-grid">
                  {themes.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={themeId === item.id ? "active" : ""}
                      onClick={() => onTheme(item.id)}
                    >
                      <i style={{ background: `linear-gradient(145deg, ${item.accent}, ${item.surface})` }} />
                      <strong>{item.name}</strong>
                      <small>{themeId === item.id ? "Active" : "Apply theme"}</small>
                    </button>
                  ))}
                </div>
                <div className="appearance-controls">
                  <label>
                    Glow intensity
                    <input type="range" min="0" max="100" defaultValue="74" />
                  </label>
                  <label>
                    Card transparency
                    <input type="range" min="20" max="95" defaultValue="72" />
                  </label>
                  <label className="switch-row">
                    Reduced motion
                    <input type="checkbox" />
                  </label>
                </div>
              </div>
            )}

            {activeTab === "reader" && (
              <div className="settings-pane">
                <span className="kicker">Reader preferences</span>
                <h3>Make every screen feel like the same good book.</h3>
                <div className="form-grid">
                  <label>
                    Page turn
                    <select defaultValue="realistic">
                      <option value="realistic">Realistic page flip</option>
                      <option value="slide">Quick slide</option>
                      <option value="fade">Fade</option>
                      <option value="none">No animation</option>
                    </select>
                  </label>
                  <label>
                    Default layout
                    <select defaultValue="auto">
                      <option value="auto">Adjust to screen</option>
                      <option value="single">Single page</option>
                      <option value="spread">Two-page spread</option>
                      <option value="vertical">Vertical manga</option>
                    </select>
                  </label>
                  <label>
                    Reading direction
                    <select defaultValue="auto">
                      <option value="auto">Detect automatically</option>
                      <option value="ltr">Left to right</option>
                      <option value="rtl">Right to left</option>
                    </select>
                  </label>
                  <label className="switch-row">
                    Show page numbers
                    <input type="checkbox" defaultChecked />
                  </label>
                </div>
              </div>
            )}

            {activeTab === "storage" && <GoogleStoragePanel />}
          </div>
        </div>
      </section>
    </div>
  );
}

function ReaderModal({
  fullscreen,
  note,
  readerRef,
  source,
  onClose,
  onFullscreen,
  onNoteChange,
  inLibrary,
  onAddToLibrary,
  offlineStatus,
  driveStatus,
  onSaveOffline,
  onSaveToDrive,
  onProgress,
}: {
  open: boolean;
  fullscreen: boolean;
  note: string;
  notesOpen: boolean;
  page: number;
  pageTurning: "next" | "previous" | null;
  readerRef: React.RefObject<HTMLDivElement>;
  source: ReaderSource | null;
  onClose: () => void;
  onFullscreen: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onNotes: () => void;
  onNoteChange: (value: string) => void;
  onCloseNotes: () => void;
  inLibrary: boolean;
  onAddToLibrary: () => void;
  offlineStatus: ReaderActionStatus;
  driveStatus: ReaderActionStatus;
  onSaveOffline: () => void;
  onSaveToDrive: () => void;
  onProgress: (progress: { page: number; totalPages: number; percent: number; mode: string }) => void;
}) {
  const activeSource: ReaderSource = source ?? {
    id: "demo-reader",
    title: "NoTVerse Sample",
    url: "/fixtures/sample.pdf",
    format: "pdf",
  };

  if (activeSource.format.toLowerCase() !== "pdf") {
    return (
      <UniversalReader
        sourceId={activeSource.id}
        sourceUrl={activeSource.url}
        title={activeSource.title}
        format={activeSource.format}
        fullscreen={fullscreen}
        readerRef={readerRef}
        note={note}
        inLibrary={inLibrary}
        offlineStatus={offlineStatus}
        driveStatus={driveStatus}
        onClose={onClose}
        onFullscreen={onFullscreen}
        onNoteChange={onNoteChange}
        onAddToLibrary={onAddToLibrary}
        onSaveOffline={onSaveOffline}
        onSaveToDrive={onSaveToDrive}
        onProgress={onProgress}
      />
    );
  }

  return (
    <PdfBookReader
      sourceId={activeSource.id}
      sourceUrl={activeSource.url}
      title={activeSource.title}
      format={activeSource.format}
      fullscreen={fullscreen}
      readerRef={readerRef}
      note={note}
      onClose={onClose}
      onFullscreen={onFullscreen}
      onNoteChange={onNoteChange}
      inLibrary={inLibrary}
      onAddToLibrary={onAddToLibrary}
      offlineStatus={offlineStatus}
      driveStatus={driveStatus}
      onSaveOffline={onSaveOffline}
      onSaveToDrive={onSaveToDrive}
      onProgress={onProgress}
    />
  );
}
