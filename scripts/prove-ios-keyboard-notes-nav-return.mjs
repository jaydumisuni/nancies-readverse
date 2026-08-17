/* Compatibility entry point.
 *
 * The old proof required Comments to intercept Back and wait for visualViewport
 * recovery before closing. Inbox is the known-good iPhone implementation and
 * does not use that lifecycle. The canonical proof now compares Comments and
 * Inbox directly so both keyboard screens obey the same shell/nav state model.
 */
await import("./prove-comments-inbox-keyboard-parity.mjs");
