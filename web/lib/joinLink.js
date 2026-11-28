// The sign-up prompt's address (app/join), bringing the visitor back to `next` afterwards (a same-site path).
export const joinHref = (next) => `/join?next=${encodeURIComponent(next || "/my-team")}`;
