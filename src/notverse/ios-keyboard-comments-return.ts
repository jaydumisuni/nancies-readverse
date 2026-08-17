export {};

/*
 * Mobile Comments now renders directly inside the Notes application tree and
 * uses ordinary form submission, matching the working Inbox lifecycle.
 *
 * This module intentionally has no runtime interception. It remains as the
 * compatibility import point so older builds/import graphs do not need another
 * structural change while the obsolete portal/reparent/focus workaround stays
 * retired.
 */
