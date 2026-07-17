import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RemoteApp } from "../app/RemoteApp";

describe("remote shell", () => {
  it("renders the primary mobile controls while loading", () => {
    const html = renderToStaticMarkup(<RemoteApp />);
    expect(html).toContain("SwitchBot Home");
    expect(html).toContain("シーン");
    expect(html).toContain("デバイス");
    expect(html).not.toContain("codex-preview");
  });
});
