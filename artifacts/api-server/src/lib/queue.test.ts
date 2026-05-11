import test from "node:test";
import assert from "node:assert/strict";
import { reminderStageFor, slugify } from "./queue";

test("slugify produces stable url slugs", () => {
  assert.equal(slugify("City Clinic & Hospital"), "city-clinic-hospital");
});

test("reminderStageFor maps queue positions", () => {
  assert.equal(reminderStageFor("waiting", 3), "three_away");
  assert.equal(reminderStageFor("waiting", 2), "two_away");
  assert.equal(reminderStageFor("waiting", 1), "one_away");
  assert.equal(reminderStageFor("in_progress", 0), "your_turn");
  assert.equal(reminderStageFor("done", 0), "done");
});