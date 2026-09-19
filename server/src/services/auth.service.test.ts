import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Mocked before importing the service, so the real repository — and through
// it the Prisma client — is never loaded. These tests need no database.
vi.mock("../repositories/user.repository", () => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
}));

import * as userRepository from "../repositories/user.repository";
import { register } from "./auth.service";
import { EmailTakenError, ValidationError } from "./errors";

const findByEmail = vi.mocked(userRepository.findByEmail);
const create = vi.mocked(userRepository.create);

const VALID = {
  name: "Orlando",
  email: "orlando@crimson.ua.edu",
  password: "correct-horse",
};

/** Echo back what the repository was asked to store, as the database would. */
function storedUser(overrides: Partial<userRepository.UserRecord> = {}) {
  return {
    id: "clx0000000000000000000000",
    name: VALID.name,
    email: VALID.email,
    passwordHash: "$2b$10$hash",
    createdAt: new Date("2026-09-18T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  findByEmail.mockResolvedValue(null);
  create.mockImplementation(async (user) => storedUser(user));
});

describe("register — main success scenario", () => {
  it("creates the user and returns their public fields", async () => {
    const user = await register(VALID);

    expect(user).toEqual({
      id: expect.any(String),
      name: "Orlando",
      email: "orlando@crimson.ua.edu",
      createdAt: expect.any(Date),
    });
  });

  it("never returns the password hash", async () => {
    const user = await register(VALID);

    expect(user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(user)).not.toContain("$2b$");
  });

  it("stores a bcrypt hash that verifies, not the password", async () => {
    await register(VALID);

    const stored = create.mock.calls[0][0];
    expect(stored.passwordHash).not.toBe(VALID.password);
    expect(stored.passwordHash).not.toContain(VALID.password);
    await expect(
      bcrypt.compare(VALID.password, stored.passwordHash)
    ).resolves.toBe(true);
    await expect(
      bcrypt.compare("not-the-password", stored.passwordHash)
    ).resolves.toBe(false);
  });

  it("normalizes the email before storing it", async () => {
    await register({ ...VALID, email: "  Orlando@Crimson.UA.EDU  " });

    expect(create.mock.calls[0][0].email).toBe("orlando@crimson.ua.edu");
  });

  it("looks up the normalized email, so case cannot bypass the check", async () => {
    await register({ ...VALID, email: "ORLANDO@CRIMSON.UA.EDU" });

    expect(findByEmail).toHaveBeenCalledWith("orlando@crimson.ua.edu");
  });

  it("trims surrounding whitespace from the name", async () => {
    await register({ ...VALID, name: "  Orlando  " });

    expect(create.mock.calls[0][0].name).toBe("Orlando");
  });

  it("produces a different hash for the same password each time (salted)", async () => {
    await register(VALID);
    await register(VALID);

    const first = create.mock.calls[0][0].passwordHash;
    const second = create.mock.calls[1][0].passwordHash;
    expect(first).not.toBe(second);
  });
});

describe("register — extension 3a: missing or malformed input", () => {
  it("rejects a missing name", async () => {
    await expect(register({ ...VALID, name: undefined })).rejects.toThrow(
      ValidationError
    );
  });

  it("rejects a malformed email", async () => {
    await expect(register({ ...VALID, email: "nope" })).rejects.toThrow(
      ValidationError
    );
  });

  it("reports every invalid field at once", async () => {
    const error = await register({
      name: "",
      email: "nope",
      password: "short",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.keys(error.fields).sort()).toEqual([
      "email",
      "name",
      "password",
    ]);
  });

  it("creates nothing when validation fails", async () => {
    await register({ name: "", email: "nope", password: "x" }).catch(() => {});

    expect(create).not.toHaveBeenCalled();
    expect(findByEmail).not.toHaveBeenCalled();
  });
});

describe("register — extension 3b: weak password", () => {
  it("rejects a password below the minimum length", async () => {
    await expect(register({ ...VALID, password: "short" })).rejects.toThrow(
      ValidationError
    );
  });

  it("names the password field in the error", async () => {
    const error = await register({ ...VALID, password: "short" }).catch(
      (e) => e
    );

    expect(error.fields).toHaveProperty("password");
  });
});

describe("register — extension 4a: email already registered", () => {
  it("throws EmailTakenError", async () => {
    findByEmail.mockResolvedValue(storedUser());

    await expect(register(VALID)).rejects.toThrow(EmailTakenError);
  });

  it("creates no second account", async () => {
    findByEmail.mockResolvedValue(storedUser());

    await register(VALID).catch(() => {});

    expect(create).not.toHaveBeenCalled();
  });

  it("does not reveal the address in the error message", async () => {
    findByEmail.mockResolvedValue(storedUser());

    const error = await register(VALID).catch((e) => e);

    expect(error.message).not.toContain(VALID.email);
    expect(error.message.toLowerCase()).not.toContain("already");
    expect(error.message.toLowerCase()).not.toContain("exists");
  });

  it("catches a duplicate that differs only in case", async () => {
    findByEmail.mockResolvedValue(storedUser());

    await expect(
      register({ ...VALID, email: "ORLANDO@crimson.ua.edu" })
    ).rejects.toThrow(EmailTakenError);
  });
});

describe("register — extension 6a: the write fails", () => {
  it("propagates the failure rather than reporting success", async () => {
    create.mockRejectedValue(new Error("connection terminated"));

    await expect(register(VALID)).rejects.toThrow("connection terminated");
  });
});
