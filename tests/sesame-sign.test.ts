import { describe, expect, it } from "vitest";

import { calculateAesCmac, createSesameSign, sesameTimestampMessage } from "../lib/sesame-sign";

describe("SESAME AES-CMAC signing", () => {
  it("matches the RFC 4493 empty-message vector", async () => {
    await expect(calculateAesCmac("2b7e151628aed2a6abf7158809cf4f3c", "")).resolves.toBe(
      "bb1d6929e95937287fa37d129b756746",
    );
  });

  it("uses the middle three little-endian timestamp bytes", () => {
    expect(Array.from(sesameTimestampMessage(0x12345678))).toEqual([0x56, 0x34, 0x12]);
  });

  it("returns a 16-byte lowercase hexadecimal signature", async () => {
    await expect(createSesameSign("00112233445566778899aabbccddeeff", 0x12345678)).resolves.toMatch(
      /^[0-9a-f]{32}$/,
    );
  });
});
