/** Order-independent key for a stack of pieces. */
export function comboKey(ids: string[]) {
  return [...ids].sort().join("|");
}
