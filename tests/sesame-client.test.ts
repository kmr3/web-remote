import { describe, expect, it } from "vitest";

import { buildSesameCommandPayload } from "../lib/sesame";

describe("SESAME command payload", () => {
  it("formats a lock command and UTF-8 history", async () => {
    const payload = await buildSesameCommandPayload(
      "lock",
      "00112233445566778899aabbccddeeff",
      "WebRemote",
      0x12345678,
    );

    expect(payload).toEqual({
      cmd: 82,
      history: "V2ViUmVtb3Rl",
      sign: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
  });

  it("formats an unlock command", async () => {
    const payload = await buildSesameCommandPayload(
      "unlock",
      "00112233445566778899aabbccddeeff",
      "WebRemote",
      0x12345678,
    );
    expect(payload.cmd).toBe(83);
  });
});
