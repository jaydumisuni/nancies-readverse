export {};

/*
 * Comments now follows the same mobile Back lifecycle as Inbox.
 *
 * Do not intercept or replay the Back click around visualViewport recovery.
 * The active phone screen owns keyboard geometry, React closes it normally,
 * and the mobile controller publishes the resulting surface state.
 */
