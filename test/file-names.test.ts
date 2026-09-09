import { describe, expect, it } from "vitest";

import { normalizeName } from "../src/components/file-tabs.js";

describe("naming a new buffer", () => {
  it("takes the set's extension when the name gives none", () => {
    expect(normalizeName("math", "gr")).toBe("math.gr");
    expect(normalizeName("bank0", "gas")).toBe("bank0.gas");
    expect(normalizeName("  spaced  ", "gas")).toBe("spaced.gas");
  });

  it("leaves a name that already carries one", () => {
    expect(normalizeName("notes.md", "gas")).toBe("notes.md");
    expect(normalizeName("bank0.gas", "gr")).toBe("bank0.gas");
  });

  it("refuses a name that could escape the set", () => {
    // §4.2: resolution is closed. A name is a key in the set, never a
    // path out of it.
    expect(normalizeName("../secret.gas", "gas")).toBeNull();
    expect(normalizeName("dir/file.gas", "gas")).toBeNull();
    expect(normalizeName("dir\\file.gas", "gas")).toBeNull();
    expect(normalizeName("..", "gas")).toBeNull();
    expect(normalizeName("   ", "gas")).toBeNull();
  });
});
