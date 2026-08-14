function submitRepliesOnEnter(event: KeyboardEvent) {
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.matches(".replies-drawer > form input")) return;
  const form = target.form;
  const button = form?.querySelector<HTMLButtonElement>("button:not([disabled])");
  if (!button) return;

  event.preventDefault();
  const draft = target.value;
  button.click();

  window.setTimeout(() => {
    if (!target.isConnected || target.value !== draft || !target.value.trim()) return;
    const retryButton = target.form?.querySelector<HTMLButtonElement>("button:not([disabled])");
    retryButton?.click();
  }, 475);
}

document.addEventListener("keydown", submitRepliesOnEnter, true);
