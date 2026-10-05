/** Order-independent key for a stack of pieces. */
export function comboKey(ids: string[]) {
  return [...ids].sort().join("|");
}

/** The ids a key was made from. */
export function comboIds(key: string) {
  return key.split("|").filter(Boolean);
}
