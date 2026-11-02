import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import app from "../app";

/**
 * OWASP A10:2025 (mishandling of exceptional conditions): a request the
 * client got wrong is answered as the client's error, in the contract's shape,
 * and isn't logged as a server bug. Before #65 these were 500s.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe("error handler — request bodies the server can't read", () => {
  it("answers a body over the size limit with 413 PAYLOAD_TOO_LARGE", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "x".repeat(200_000), password: "y" }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." },
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("answers an unsupported content encoding with 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "not-a-real-encoding")
      .send("{}");

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(logged).not.toHaveBeenCalled();
  });

  it("still answers malformed JSON with 400 INVALID_JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});
