import assert from "node:assert/strict";
import test from "node:test";

const SETUPABLE_STATES = new Set(["pending-for-input", "insufficient", "ready"]);
const INVENTORY_SELF_MANAGED_TYPES = new Set(["OCP", "SNO"]);

function shouldShowSetupButton(status: string, type: string): boolean {
  return SETUPABLE_STATES.has(status) && INVENTORY_SELF_MANAGED_TYPES.has(type);
}

test("B4 setup button shown for OCP cluster in pending-for-input state", () => {
  assert.equal(shouldShowSetupButton("pending-for-input", "OCP"), true);
});

test("B4 setup button shown for SNO cluster in pending-for-input state", () => {
  assert.equal(shouldShowSetupButton("pending-for-input", "SNO"), true);
});

test("B4 setup button shown for OCP cluster in insufficient state", () => {
  assert.equal(shouldShowSetupButton("insufficient", "OCP"), true);
});

test("B4 setup button shown for SNO cluster in ready state", () => {
  assert.equal(shouldShowSetupButton("ready", "SNO"), true);
});

test("B4 setup button hidden for ROSA cluster in pending-for-input state", () => {
  assert.equal(shouldShowSetupButton("pending-for-input", "ROSA"), false);
});

test("B4 setup button hidden for ARO cluster in ready state", () => {
  assert.equal(shouldShowSetupButton("ready", "ARO"), false);
});

test("B4 setup button hidden for OSD cluster in insufficient state", () => {
  assert.equal(shouldShowSetupButton("insufficient", "OSD"), false);
});

test("B4 setup button hidden for Managed cluster in pending-for-input state", () => {
  assert.equal(shouldShowSetupButton("pending-for-input", "Managed"), false);
});

test("B4 setup button hidden for OCP cluster in installing state", () => {
  assert.equal(shouldShowSetupButton("installing", "OCP"), false);
});

test("B4 setup button hidden for OCP cluster in installed state", () => {
  assert.equal(shouldShowSetupButton("installed", "OCP"), false);
});

test("B4 setup button hidden for SNO cluster in error state", () => {
  assert.equal(shouldShowSetupButton("error", "SNO"), false);
});

test("B4 setup button hidden for OCP cluster in finalizing state", () => {
  assert.equal(shouldShowSetupButton("finalizing", "OCP"), false);
});
