export type BackAction = "back" | "home" | "exit";

export function decideBack(
  root: boolean,
  knownPredecessor: boolean,
  canGoBack: boolean,
): BackAction {
  if (root) return "exit";
  return knownPredecessor && canGoBack ? "back" : "home";
}

/** An ephemeral ledger of router entries observed since this document loaded. */
export class RouteHistory {
  private keys: string[] = [];
  private index = -1;
  observe(key: string, action: string): void {
    if (this.keys[this.index] === key) return;
    const known = this.keys.indexOf(key);
    if (action === "POP" && known >= 0) {
      this.index = known;
      return;
    }
    if (action === "REPLACE" && this.index >= 0) {
      this.keys[this.index] = key;
      return;
    }
    if (action === "PUSH" && this.index >= 0) {
      this.keys = this.keys.slice(0, this.index + 1);
      this.keys.push(key);
      this.index++;
      return;
    }
    this.keys = [key];
    this.index = 0;
  }
  get hasPredecessor(): boolean {
    return this.index > 0;
  }
}
