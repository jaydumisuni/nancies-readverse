from pathlib import Path

app_path = Path("src/App.tsx")
app = app_path.read_text()

old_state = '  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 1280);'
new_state = '  const [chatOpen, setChatOpen] = useState(false);'
if old_state in app:
    app = app.replace(old_state, new_state, 1)
elif new_state not in app:
    raise SystemExit("NoTVerse chat state target missing")

anchor = '''  useEffect(() => {
    setNudgeVisible(true);
    const timer = window.setTimeout(() => setNudgeVisible(false), 7500);
    return () => window.clearTimeout(timer);
  }, [selectedCompanionId]);
'''
focused = anchor + '''
  useEffect(() => {
    if (activeSection !== "home") setChatOpen(false);
  }, [activeSection]);
'''
if focused not in app:
    if anchor not in app:
        raise SystemExit("NoTVerse focused workspace effect target missing")
    app = app.replace(anchor, focused, 1)

app_path.write_text(app)

proof_path = Path("scripts/verify-notverse-polish.mjs")
proof = proof_path.read_text()
old_assert = '  assert(!(await appPage.locator(".floating-companion").isVisible()), "floating companion covers the desktop Notes workspace");'
new_assert = old_assert + '\n  assert(!(await appPage.locator(".companion-panel").isVisible()), "companion panel remains open over desktop Notes");'
if new_assert not in proof:
    if old_assert not in proof:
        raise SystemExit("NoTVerse desktop focus proof target missing")
    proof = proof.replace(old_assert, new_assert, 1)
proof_path.write_text(proof)

print("Applied focused NoTVerse workspace correction")
