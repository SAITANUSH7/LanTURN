// Circuit breaker per provider+model. After FAILS consecutive failures the circuit opens and calls fail fast
// for COOLDOWN ms (so a dead provider costs nothing instead of a 30 s timeout per request); then one probe is let
// through (half-open). A success closes it.
const FAILS = Number(process.env.BREAKER_FAILS || 3);
const COOLDOWN = Number(process.env.BREAKER_COOLDOWN_MS || 60_000);
const state = new Map(); // key -> { fails, openedAt, probing }
let now = () => Date.now();
export const __setClock = (fn) => { now = fn || (() => Date.now()); };
export const __reset = () => state.clear();

export class CircuitOpen extends Error {
  constructor(key, retryInMs) { super(`circuit open for ${key}, retry in ${Math.ceil(retryInMs / 1000)}s`); this.code = 'CIRCUIT_OPEN'; }
}

export function allow(key) {
  const s = state.get(key);
  if (!s || s.fails < FAILS) return;
  const wait = s.openedAt + COOLDOWN - now();
  if (wait > 0) throw new CircuitOpen(key, wait);
  if (s.probing) throw new CircuitOpen(key, 1000); // someone else is already probing
  s.probing = true;
}
export function success(key) { state.delete(key); }
export function failure(key) {
  const s = state.get(key) || { fails: 0, openedAt: 0, probing: false };
  s.fails += 1; s.probing = false;
  if (s.fails >= FAILS) s.openedAt = now();
  state.set(key, s);
}
export function breakerStates() {
  return [...state.entries()].map(([key, s]) => ({ key, fails: s.fails, open: s.fails >= FAILS && s.openedAt + COOLDOWN > now(), retryInMs: Math.max(0, s.openedAt + COOLDOWN - now()) }));
}
