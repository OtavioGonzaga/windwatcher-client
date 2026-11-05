import { describe, expect, it } from "vitest";
import { decideBack, RouteHistory } from "./back-policy";

describe("Android route history", () => {
  it("does not infer internal history from a direct child entry or native canGoBack", () => {
    const history = new RouteHistory();
    history.observe("child", "POP");
    expect(decideBack(false, history.hasPredecessor, true)).toBe("home");
    expect(decideBack(true, true, true)).toBe("exit");
  });
  it("tracks push/pop/replace and discards unrelated or abandoned entries", () => {
    const history = new RouteHistory();
    history.observe("home", "POP");
    history.observe("child", "PUSH");
    expect(decideBack(false, history.hasPredecessor, true)).toBe("back");
    expect(decideBack(false, history.hasPredecessor, false)).toBe("home");
    history.observe("home", "POP");
    expect(history.hasPredecessor).toBe(false);
    history.observe("unknown", "PUSH");
    history.observe("replacement", "REPLACE");
    expect(history.hasPredecessor).toBe(true);
    history.observe("child", "POP");
    expect(history.hasPredecessor).toBe(false);
  });
});
