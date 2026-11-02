import { vi } from "vitest";

/**
 * The `vi.mock` factory for `../lib/api` in the component tests (#76): the
 * real module, with every `api.*` method replaced by a `vi.fn()`. `ApiError`
 * stays the real class, because the screens branch on its `code`.
 *
 * It lives apart from `render.tsx` because `vi.mock` is hoisted above the
 * test file's imports, so the factory has to load it itself:
 *
 *   vi.mock("../lib/api", async (importOriginal) =>
 *     (await import("../test/mockApi")).mockApiModule(importOriginal));
 */
export async function mockApiModule(importOriginal: () => Promise<unknown>) {
  const actual = (await importOriginal()) as { api: Record<string, unknown> };
  const api = Object.fromEntries(Object.keys(actual.api).map((name) => [name, vi.fn()]));
  return { ...actual, api };
}
