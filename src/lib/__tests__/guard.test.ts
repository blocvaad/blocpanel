import { describe, it, expect, beforeEach, vi } from "vitest";

// Program requireFullSession's result per-test.
let authResult: any = { ok: false, reason: "unauthenticated" };
vi.mock("../auth", () => ({
  requireFullSession: async () => authResult,
}));

import { guard } from "../guard";

const fullAdmin = { ok: true, session: { id: "a1", email: "a@x.co", full_name: "A", role: "admin", auth_level: "mfa" } };
const fullViewer = { ok: true, session: { id: "v1", email: "v@x.co", full_name: "V", role: "viewer", auth_level: "mfa" } };
const fullSuper = { ok: true, session: { id: "s1", email: "s@x.co", full_name: "S", role: "superadmin", auth_level: "mfa" } };

beforeEach(() => { authResult = { ok: false, reason: "unauthenticated" }; });

describe("guard — session gate", () => {
  it("blocks unauthenticated with 401", async () => {
    authResult = { ok: false, reason: "unauthenticated" };
    const g = await guard();
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(401);
  });

  it("blocks pre-MFA (mfa_required) with 401", async () => {
    authResult = { ok: false, reason: "mfa_required" };
    const g = await guard();
    if (!g.ok) expect(g.response.status).toBe(401);
    else throw new Error("should block");
  });

  it("blocks revoked with 401", async () => {
    authResult = { ok: false, reason: "revoked" };
    const g = await guard();
    if (!g.ok) expect(g.response.status).toBe(401);
    else throw new Error("should block");
  });

  it("blocks disabled admin with 401", async () => {
    authResult = { ok: false, reason: "disabled" };
    const g = await guard();
    if (!g.ok) expect(g.response.status).toBe(401);
    else throw new Error("should block");
  });

  it("allows a full session with no extra requirement", async () => {
    authResult = fullAdmin;
    const g = await guard();
    expect(g.ok).toBe(true);
    if (g.ok) expect(g.session.id).toBe("a1");
  });
});

describe("guard — permission gate", () => {
  it("allows admin with a granted permission", async () => {
    authResult = fullAdmin;
    const g = await guard({ permission: "buildings.modify" });
    expect(g.ok).toBe(true);
  });

  it("blocks viewer from a write permission with 403", async () => {
    authResult = fullViewer;
    const g = await guard({ permission: "buildings.modify" });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(403);
  });

  it("blocks admin from a superadmin-only permission with 403", async () => {
    authResult = fullAdmin;
    const g = await guard({ permission: "admins.manage" });
    if (!g.ok) expect(g.response.status).toBe(403);
    else throw new Error("should block");
  });

  it("allows viewer a read permission", async () => {
    authResult = fullViewer;
    const g = await guard({ permission: "buildings.read" });
    expect(g.ok).toBe(true);
  });
});

describe("guard — exact role gate", () => {
  it("allows superadmin when role superadmin is required", async () => {
    authResult = fullSuper;
    const g = await guard({ role: "superadmin" });
    expect(g.ok).toBe(true);
  });

  it("blocks admin when role superadmin is required (403)", async () => {
    authResult = fullAdmin;
    const g = await guard({ role: "superadmin" });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.response.status).toBe(403);
  });

  it("session gate runs before role gate (revoked superadmin still blocked 401)", async () => {
    authResult = { ok: false, reason: "revoked" };
    const g = await guard({ role: "superadmin" });
    if (!g.ok) expect(g.response.status).toBe(401);
    else throw new Error("should block");
  });
});
