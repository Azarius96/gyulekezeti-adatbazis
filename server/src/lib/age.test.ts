import test from "node:test";
import assert from "node:assert/strict";
import { ageOn, ageOnJan1 } from "./age.js";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

test("ageOnJan1: január 1-jén született már betöltötte a kort, január 2-án született még nem", () => {
  assert.equal(ageOnJan1(d("1956-01-01"), 2026), 70);
  assert.equal(ageOnJan1(d("1956-01-02"), 2026), 69);
  assert.equal(ageOnJan1(d("1955-12-31"), 2026), 70);
  assert.equal(ageOnJan1(d("1956-12-31"), 2026), 69);
});

test("ageOnJan1: szökőnapon születettnél is helyes", () => {
  assert.equal(ageOnJan1(d("2004-02-29"), 2026), 21);
  assert.equal(ageOnJan1(d("2004-02-29"), 2027), 22);
});

test("ageOn: a mai napig betöltött évek", () => {
  assert.equal(ageOn(d("1956-02-05"), new Date(2026, 1, 4)), 69);
  assert.equal(ageOn(d("1956-02-05"), new Date(2026, 1, 5)), 70);
});
