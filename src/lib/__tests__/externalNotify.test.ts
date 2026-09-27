import { describe, it, expect, vi, afterEach } from "vitest";
import { formatExternalMessage, notifyExternal } from "../externalNotify";

afterEach(() => { vi.unstubAllGlobals(); delete process.env.EXTERNAL_WEBHOOK_URL; });

describe("externalNotify — direct, no public relay endpoint", () => {
  it("formats building.created", () => {
    expect(formatExternalMessage("building.created", { name: "השקד 104", plan: "tower" })).toBe("בניין חדש נוצר: השקד 104 (tower)");
  });
  it("no URL / non-https URL → no request", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await notifyExternal("building.created", { name: "x" });
    process.env.EXTERNAL_WEBHOOK_URL = "http://insecure.example";
    await notifyExternal("building.created", { name: "x" });
    expect(f).not.toHaveBeenCalled();
  });
  it("posts once to the configured https URL and swallows failures", async () => {
    process.env.EXTERNAL_WEBHOOK_URL = "https://hooks.example/x";
    const f = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", f);
    await expect(notifyExternal("building.created", { name: "x" })).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("https://hooks.example/x");
  });
});
