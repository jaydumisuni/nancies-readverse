type StoredNote = { spoilerBoundary?: string; [key: string]: unknown };
type StoredActivity = { title?: string; [key: string]: unknown };

function migrateLegacyNoteData() {
  const rawNotes = window.localStorage.getItem("notverse.notes");
  if (rawNotes) {
    try {
      const notes = JSON.parse(rawNotes) as StoredNote[];
      if (Array.isArray(notes)) {
        let changed = false;
        const next = notes.map((note) => {
          if (note?.spoilerBoundary !== "No spoilers") return note;
          changed = true;
          const { spoilerBoundary: _legacy, ...clean } = note;
          return clean;
        });
        if (changed) window.localStorage.setItem("notverse.notes", JSON.stringify(next));
      }
    } catch {
      // Leave malformed user data untouched.
    }
  }

  const rawActivity = window.localStorage.getItem("notverse.noteActivity");
  if (rawActivity) {
    try {
      const activity = JSON.parse(rawActivity) as StoredActivity[];
      if (Array.isArray(activity)) {
        let changed = false;
        const next = activity.map((entry) => {
          const migrated = { ...entry };
          if (typeof migrated.title === "string") {
            const value = migrated.title
              .replace(/Reply added to your Note/g, "Comment added to your Note")
              .replace(/You replied to /g, "You commented on ");
            changed ||= value !== migrated.title;
            migrated.title = value;
          }
          return migrated;
        });
        if (changed) window.localStorage.setItem("notverse.noteActivity", JSON.stringify(next));
      }
    } catch {
      // Leave malformed user data untouched.
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", migrateLegacyNoteData, { once: true });
} else {
  migrateLegacyNoteData();
}
