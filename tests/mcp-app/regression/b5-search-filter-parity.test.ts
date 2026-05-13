import assert from "node:assert/strict";
import test from "node:test";

type ClusterRow = { name: string; id: string; status: string; type: string };

function filterClusters(clusters: ClusterRow[], query: string): ClusterRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return clusters;
  return clusters.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
}

const MOCK_CLUSTERS: ClusterRow[] = [
  { name: "prod-ocp", id: "762df996-acba-4a42-9fe9-edb0a8ec8bee", status: "installing", type: "OCP" },
  { name: "dev-ocp", id: "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7", status: "ready", type: "OCP" },
  { name: "rosa-prod", id: "2o2gevtk4bohdu41ff4jps0dl8rrshb6", status: "ready", type: "ROSA" },
  { name: "aro-dev", id: "20ekbvg1jkaqssc47mmc0irlvhf59c0p", status: "ready", type: "ARO" },
  { name: "edge-01", id: "8e5d3e45-77c6-440b-9cfa-9f88187535c6", status: "pending-for-input", type: "SNO" },
];

test("B5 empty query returns all clusters", () => {
  assert.equal(filterClusters(MOCK_CLUSTERS, "").length, 5);
  assert.equal(filterClusters(MOCK_CLUSTERS, "  ").length, 5);
});

test("B5 filters by name substring (case-insensitive)", () => {
  const result = filterClusters(MOCK_CLUSTERS, "prod");
  assert.equal(result.length, 2);
  assert.ok(result.some((c) => c.name === "prod-ocp"));
  assert.ok(result.some((c) => c.name === "rosa-prod"));
});

test("B5 filters by name exact match", () => {
  const result = filterClusters(MOCK_CLUSTERS, "edge-01");
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "edge-01");
});

test("B5 filters by partial cluster ID", () => {
  const result = filterClusters(MOCK_CLUSTERS, "762df996");
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "prod-ocp");
});

test("B5 filters by full cluster ID", () => {
  const result = filterClusters(MOCK_CLUSTERS, "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7");
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "dev-ocp");
});

test("B5 filter is case-insensitive for name", () => {
  const result = filterClusters(MOCK_CLUSTERS, "PROD");
  assert.equal(result.length, 2);
});

test("B5 filter is case-insensitive for ID", () => {
  const result = filterClusters(MOCK_CLUSTERS, "762DF996");
  assert.equal(result.length, 1);
});

test("B5 returns empty for no match", () => {
  const result = filterClusters(MOCK_CLUSTERS, "nonexistent-xyz");
  assert.equal(result.length, 0);
});

test("B5 filters by type-like substring in name", () => {
  const result = filterClusters(MOCK_CLUSTERS, "ocp");
  assert.equal(result.length, 2);
  assert.ok(result.some((c) => c.name === "prod-ocp"));
  assert.ok(result.some((c) => c.name === "dev-ocp"));
});
