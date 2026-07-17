import { describe, expect, it } from "vitest";

import { resolveRole } from "../lib/auth";

describe("access roles", () => {
  it("recognizes the owner access code", async () => {
    await expect(resolveRole("owner-code", "owner-code", "guest-code")).resolves.toBe("owner");
  });

  it("recognizes the guest access code", async () => {
    await expect(resolveRole("guest-code", "owner-code", "guest-code")).resolves.toBe("guest");
  });

  it("rejects an unknown access code", async () => {
    await expect(resolveRole("unknown", "owner-code", "guest-code")).resolves.toBeNull();
  });

  it("gives owner precedence when both codes match", async () => {
    await expect(resolveRole("same-code", "same-code", "same-code")).resolves.toBe("owner");
  });
});
