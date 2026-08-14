function syncNotificationLabel() {
  const button = document.querySelector<HTMLButtonElement>(".notes-social-experience .notes-activity-button");
  if (!button) return;
  if (button.getAttribute("aria-label") !== "Notifications") button.setAttribute("aria-label", "Notifications");
  if (button.title !== "Notifications") button.title = "Notifications";
}

function startNotificationLabelSync() {
  syncNotificationLabel();
  const observer = new MutationObserver(syncNotificationLabel);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label"],
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startNotificationLabelSync, { once: true });
} else {
  startNotificationLabelSync();
}
