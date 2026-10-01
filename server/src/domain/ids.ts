// IDs are ULIDs. Monotonic within a process so event ids sort by creation order.
// https://github.com/ulid/javascript
import { monotonicFactory } from "ulid";

const next = monotonicFactory();

export function newId(): string {
  return next();
}

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
