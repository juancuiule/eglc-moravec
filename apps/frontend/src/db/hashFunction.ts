import { sha256 } from "js-sha256";
import type { HashFunction } from "rxdb";

/**
 * RxDB's default hash function needs `crypto.subtle.digest`, which browsers
 * only expose in a secure context (HTTPS, or literally `localhost`) — this
 * app is self-hosted over plain HTTP on a LAN (see `randomId.ts` for the
 * same constraint hit before, for `crypto.randomUUID`), so that's never
 * available. This hash never needs to be cryptographically trustworthy —
 * RxDB only uses it internally, for schema/revision comparison, not for
 * anything security-relevant — so a pure-JS implementation with no runtime
 * requirement sidesteps the problem entirely instead of working around it.
 */
export const insecureContextHashFunction: HashFunction = async (input) => {
  if (input instanceof Blob) return sha256(await input.arrayBuffer());
  return sha256(input);
};
