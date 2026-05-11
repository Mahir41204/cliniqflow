import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, normalizeEmail, verifyPassword } from "./auth";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Example@Email.com  "), "example@email.com");
});

test("hashPassword and verifyPassword round-trip", () => {
  const hash = hashPassword("correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", hash), true);
  assert.equal(verifyPassword("wrong password", hash), false);
});