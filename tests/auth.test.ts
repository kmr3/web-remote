import { describe, expect, it } from "vitest";

import { publicAccessIsExpired, resolveRole } from "../lib/auth";

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

describe("temporary public access", () => {
  const deadline = "2026-08-27T12:00:00+09:00";

  it("allows requests before the deadline", () => {
    expect(publicAccessIsExpired(Date.parse("2026-08-27T11:59:59+09:00"), deadline)).toBe(false);
  });

  it("expires exactly at the deadline", () => {
    expect(publicAccessIsExpired(Date.parse(deadline), deadline)).toBe(true);
  });

  it("does not expire when no deadline is configured", () => {
    expect(publicAccessIsExpired(Date.parse("2030-01-01T00:00:00Z"), "")).toBe(false);
  });

  it("fails closed when the deadline is invalid", () => {
    expect(publicAccessIsExpired(Date.now(), "not-a-date")).toBe(true);
  });
});
