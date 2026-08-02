import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { DiscoveryPreference, NoTVersePreferences, ReadingInterest, ReadingVisibility, SpoilerPreference } from "./types";

type SetupProfile = {
  name: string;
  displayName: string;
  birthday: string;
  gender: "woman" | "man" | "nonbinary" | "prefer_not_to_say";
  pronouns: string;
  status: string;
  avatarDataUrl: string;
};

type ThemeChoice = { id: string; name: string; accent: string; surface: string };
type CompanionChoice = { id: string; name: string; summary: string; avatar: string; ring: string };

type Props = {
  profile: SetupProfile;
  preferences: NoTVersePreferences;
  selectedTheme: string;
  selectedCompanion: string;
  themes: ThemeChoice[];
  companions: CompanionChoice[];
  onProfile: (profile: SetupProfile) => void;
  onPreferences: (preferences: NoTVersePreferences) => void;
  onTheme: (theme: string) => void;
  onCompanion: (companion: string) => void;
  onComplete: () => void;
};

const interests: ReadingInterest[] = ["Manga", "Manhwa", "Comics", "Graphic novels", "Light novels", "Novels", "Research papers", "PDFs", "Textbooks", "Magazines", "Other"];
const discovery: DiscoveryPreference[] = ["Title, author, series or ISBN", "Describe something from memory", "Scan a cover", "Scan a page", "Paste a source link", "Voice description"];

export default function SetupWizard({ profile, preferences, selectedTheme, selectedCompanion, themes, companions, onProfile, onPreferences, onTheme, onCompanion, onComplete }: Props) {
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState<"forward" | "back" | null>(null);
  const pointerStart = useRef<number | null>(null);
  const locked = useRef(false);
  const pages = 10;

  function move(direction: "forward" | "back") {
    if (locked.current) return;
    if (direction === "forward" && page === pages - 1) {
      locked.current = true;
      setTurn("forward");
      window.setTimeout(onComplete, preferences.reducedMotion ? 100 : 520);
      return;
    }
    const next = Math.max(0, Math.min(pages - 1, page + (direction === "forward" ? 1 : -1)));
    if (next === page) return;
    locked.current = true;
    setTurn(direction);
    window.setTimeout(() => {
      setPage(next);
      setTurn(null);
      locked.current = false;
    }, preferences.reducedMotion ? 80 : 460);
  }

  useEffect(() => {
    let accumulated = 0;
    let reset = 0;
    function wheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) < 10) return;
      event.preventDefault();
      accumulated += event.deltaY;
      window.clearTimeout(reset);
      reset = window.setTimeout(() => { accumulated = 0; }, 180);
      if (Math.abs(accumulated) > 110) {
        move(accumulated > 0 ? "forward" : "back");
        accumulated = 0;
      }
    }
    window.addEventListener("wheel", wheel, { passive: false });
    return () => { window.removeEventListener("wheel", wheel); window.clearTimeout(reset); };
  }, [page, preferences.reducedMotion]);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,textarea,select,label,a")) {
      pointerStart.current = null;
      return;
    }
    pointerStart.current = event.clientY;
  }
  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start === null) return;
    const delta = start - event.clientY;
    if (Math.abs(delta) > 65) move(delta > 0 ? "forward" : "back");
  }

  function toggleInterest(value: ReadingInterest) {
    const selected = preferences.interests.includes(value);
    onPreferences({ ...preferences, interests: selected ? preferences.interests.filter((item) => item !== value) : [...preferences.interests, value] });
  }
  function toggleDiscovery(value: DiscoveryPreference) {
    const selected = preferences.discovery.includes(value);
    onPreferences({ ...preferences, discovery: selected ? preferences.discovery.filter((item) => item !== value) : [...preferences.discovery, value] });
  }
  function photo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onProfile({ ...profile, avatarDataUrl: typeof reader.result === "string" ? reader.result : "" });
    reader.readAsDataURL(file);
  }

  return (
    <div className="notverse-setup" onPointerDown={pointerDown} onPointerUp={pointerUp} data-page={page + 1}>
      <div className="setup-brand"><span className="notverse-mark" role="img" aria-label="NoTVerse" /><b>{page + 1} / {pages}</b></div>
      <div className={`setup-paper-stack turn-${turn || "idle"}`}>
        <section className={`setup-sheet setup-sheet-${page + 1}`}>
          {page === 0 && <SetupCover />}
          {page === 1 && <ProfilePage profile={profile} onProfile={onProfile} onPhoto={photo} />}
          {page === 2 && <ChoicePage title="What do you love to read?" subtitle="Choose anything that belongs in your universe." values={interests} selected={preferences.interests} onToggle={(value) => toggleInterest(value as ReadingInterest)} />}
          {page === 3 && <ChoicePage title="How should NoTVerse find it?" subtitle="These tools remain available later. Camera and microphone permission is requested only when used." values={discovery} selected={preferences.discovery} onToggle={(value) => toggleDiscovery(value as DiscoveryPreference)} />}
          {page === 4 && <AppearancePage preferences={preferences} themes={themes} selectedTheme={selectedTheme} onPreferences={onPreferences} onTheme={onTheme} />}
          {page === 5 && <PrivacyPage />}
          {page === 6 && <CompanionPage companions={companions} selected={selectedCompanion} onCompanion={onCompanion} />}
          {page === 7 && <ActivityPage preferences={preferences} onPreferences={onPreferences} />}
          {page === 8 && <CommunityPage preferences={preferences} onPreferences={onPreferences} />}
          {page === 9 && <SetupComplete />}
        </section>
      </div>
      <div className="setup-progress">{Array.from({ length: pages }, (_, index) => <i className={index === page ? "active" : index < page ? "done" : ""} key={index} />)}</div>
      <div className="setup-swipe-hint"><span>⌃</span><strong>{page === pages - 1 ? "Swipe up to enter" : "Swipe up for next"}</strong>{page > 0 && <small>Swipe down to go back</small>}</div>
    </div>
  );
}

function SetupCover() {
  return <div className="setup-cover-page"><span className="cover-notebook" role="img" aria-label="NoTVerse" /><h2>Created for Nancy. Shared with the world.</h2><p>Every reader leaves something behind.<br />Sometimes it is only a Note.</p><em>Swipe up to begin</em></div>;
}

function ProfilePage({ profile, onProfile, onPhoto }: { profile: SetupProfile; onProfile: (profile: SetupProfile) => void; onPhoto: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <div className="setup-form-page"><h1>Let&apos;s get to know you</h1><label className="setup-photo">{profile.avatarDataUrl ? <img src={profile.avatarDataUrl} alt="" /> : <span>{(profile.displayName || "N").slice(0, 1)}</span>}<input type="file" accept="image/*" onChange={onPhoto} /><b>Profile picture</b></label><div className="setup-form-grid"><label>Display name<input value={profile.displayName} onChange={(event) => onProfile({ ...profile, displayName: event.target.value })} /></label><label>Nickname <small>optional</small><input value={profile.name} onChange={(event) => onProfile({ ...profile, name: event.target.value })} /></label><label>Birthday <small>optional</small><input type="date" value={profile.birthday} onChange={(event) => onProfile({ ...profile, birthday: event.target.value })} /></label><label>Gender <small>optional</small><select value={profile.gender} onChange={(event) => onProfile({ ...profile, gender: event.target.value as SetupProfile["gender"] })}><option value="prefer_not_to_say">Prefer not to say</option><option value="woman">Woman</option><option value="man">Man</option><option value="nonbinary">Non-binary</option></select></label><label>Pronouns <small>optional</small><input value={profile.pronouns} onChange={(event) => onProfile({ ...profile, pronouns: event.target.value })} /></label><label className="wide">Short status <small>optional</small><textarea value={profile.status} onChange={(event) => onProfile({ ...profile, status: event.target.value })} /></label></div></div>;
}

function ChoicePage({ title, subtitle, values, selected, onToggle }: { title: string; subtitle: string; values: readonly string[]; selected: readonly string[]; onToggle: (value: string) => void }) {
  return <div className="setup-choice-page"><h1>{title}</h1><p>{subtitle}</p><div className="setup-choice-grid">{values.map((value) => <label className={selected.includes(value) ? "selected" : ""} key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} /><span>{value}</span></label>)}</div><small>You can update these at any time.</small></div>;
}

function AppearancePage({ preferences, themes, selectedTheme, onPreferences, onTheme }: { preferences: NoTVersePreferences; themes: ThemeChoice[]; selectedTheme: string; onPreferences: (preferences: NoTVersePreferences) => void; onTheme: (theme: string) => void }) {
  return <div className="setup-choice-page"><h1>Personalize your NoTVerse</h1><p>Pink is the brand default, not a rule.</p><div className="setup-theme-row">{themes.map((theme) => <button type="button" key={theme.id} className={selectedTheme === theme.id ? "selected" : ""} style={{ "--setup-color": theme.accent } as React.CSSProperties} onClick={() => onTheme(theme.id)} aria-label={theme.name} />)}</div><div className="setup-form-grid"><label>Accent intensity<input type="range" min="30" max="100" value={preferences.accentIntensity} onChange={(event) => onPreferences({ ...preferences, accentIntensity: Number(event.target.value) })} /></label><label>Paper texture<input type="range" min="0" max="100" value={preferences.paperTexture} onChange={(event) => onPreferences({ ...preferences, paperTexture: Number(event.target.value) })} /></label><label>Reader font<select value={preferences.readerFont} onChange={(event) => onPreferences({ ...preferences, readerFont: event.target.value as NoTVersePreferences["readerFont"] })}><option value="clean">Clean</option><option value="serif">Book serif</option><option value="typewriter">Typewriter</option></select></label><label>Note writing font<select value={preferences.noteFont} onChange={(event) => onPreferences({ ...preferences, noteFont: event.target.value as NoTVersePreferences["noteFont"] })}><option value="handwritten">Handwritten</option><option value="clean">Clean</option><option value="typewriter">Typewriter</option></select></label><label className="setup-switch wide"><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => onPreferences({ ...preferences, reducedMotion: event.target.checked })} /> Reduced animation</label></div></div>;
}

function PrivacyPage() {
  return <div className="setup-privacy-page"><h1>Your privacy</h1><ul><li><span>▣</span><strong>Your Notes are private by default.</strong><b>✓</b></li><li><span>♙</span><strong>Only you decide what to share.</strong><b>✓</b></li><li><span>◇</span><strong>Reading files remain temporary unless you save them.</strong><b>✓</b></li><li><span>▤</span><strong>Google Drive is used only after you connect it.</strong><b>✓</b></li></ul><em>Privacy is a behaviour, not a slogan.</em></div>;
}

function CompanionPage({ companions, selected, onCompanion }: { companions: CompanionChoice[]; selected: string; onCompanion: (id: string) => void }) {
  return <div className="setup-companion-page"><h1>Choose your companion</h1><p>Your companion keeps you company, helps you search and reads the room without becoming the room.</p><div className="setup-companion-grid">{companions.map((companion) => <button type="button" className={selected === companion.id ? "selected" : ""} key={companion.id} onClick={() => onCompanion(companion.id)} style={{ "--companion-color": companion.ring } as React.CSSProperties}><span><img src={companion.avatar} alt="" /></span><strong>{companion.name}</strong><small>{companion.summary}</small></button>)}</div><em>You can change your companion at any time.</em></div>;
}

function ActivityPage({ preferences, onPreferences }: { preferences: NoTVersePreferences; onPreferences: (preferences: NoTVersePreferences) => void }) {
  const visibility: Array<[ReadingVisibility, string]> = [["reading", "Show that I am reading"], ["book", "Show the book only"], ["approximate", "Show approximate chapter or volume"], ["private", "Keep my reading activity private"]];
  const spoilers: Array<[SpoilerPreference, string]> = [["progress", "Use my reading progress"], ["hide", "Hide all spoilers"], ["completed", "Show spoilers for completed books"], ["ask", "Always ask before revealing"]];
  return <div className="setup-choice-page"><h1>Reading activity & spoilers</h1><p>Exact page position remains private by default.</p><h3>What may others see?</h3><div className="setup-option-list">{visibility.map(([value, label]) => <label className={preferences.readingVisibility === value ? "selected" : ""} key={value}><input type="radio" name="visibility" checked={preferences.readingVisibility === value} onChange={() => onPreferences({ ...preferences, readingVisibility: value })} />{label}</label>)}</div><h3>Spoiler protection</h3><div className="setup-option-list compact">{spoilers.map(([value, label]) => <label className={preferences.spoilerPreference === value ? "selected" : ""} key={value}><input type="radio" name="spoilers" checked={preferences.spoilerPreference === value} onChange={() => onPreferences({ ...preferences, spoilerPreference: value })} />{label}</label>)}</div></div>;
}

function CommunityPage({ preferences, onPreferences }: { preferences: NoTVersePreferences; onPreferences: (preferences: NoTVersePreferences) => void }) {
  const items: Array<[keyof NoTVersePreferences["community"], string]> = [["seePublicNotes", "See public Notes"], ["seeLibraryNotes", "See Notes about books in my Library"], ["allowFollowers", "Allow people to follow my public Notes"], ["messageRequests", "Receive message requests"], ["appearInNotebooks", "Appear in shared Notebooks"], ["privateByDefault", "Keep new Notes private initially"]];
  return <div className="setup-choice-page"><h1>Notes and community</h1><p>Choose the social parts you want now. Every setting can change later.</p><div className="setup-option-list">{items.map(([key, label]) => <label className={preferences.community[key] ? "selected" : ""} key={key}><input type="checkbox" checked={preferences.community[key]} onChange={(event) => onPreferences({ ...preferences, community: { ...preferences.community, [key]: event.target.checked } })} />{label}</label>)}</div><small>Notes created inside the reader remain private until you deliberately publish them.</small></div>;
}

function SetupComplete() {
  return <div className="setup-complete-page"><span className="cover-notebook">▤</span><h1>You&apos;re all set.</h1><h2>Your NoTVerse is ready.</h2><p><strong>Created for Nancy. Shared with the world.</strong></p><ul><li>▣ Private by default</li><li>♙ Your world, your rules</li><li>◎ Share when you choose</li></ul><em>Your stories.<br />Your Notes.<br />Your Verse.</em></div>;
}
