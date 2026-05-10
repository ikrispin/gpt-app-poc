# Cluster Health Operations

Combined reference for etcd maintenance, PVC capacity planning, and database connection management.

---
title: etcd Maintenance and Defragmentation
category: operations
sources:
  - title: etcd maintenance - Backup and restore
    url: https://docs.openshift.com/container-platform/latest/backup_and_restore/control_plane_backup_and_restore/backing-up-etcd.html
    date_accessed: 2026-05-05
  - title: etcd defragmentation
    url: https://etcd.io/docs/v3.5/op-guide/maintenance/#defragmentation
    date_accessed: 2026-05-05
  - title: Kubernaut Demo Scenarios - etcd defrag golden transcript
    url: https://github.com/jordigilh/kubernaut-demo-scenarios/blob/feature/v1.4-new-scenarios/golden-transcripts/etcd-defrag-forecast-etcdhighfragmentationratio.json
    date_accessed: 2026-05-05
tags: [etcd, defragmentation, maintenance, monitoring, performance]
semantic_keywords: [etcd defrag, etcd fragmentation, etcd maintenance, etcd monitoring, etcd compaction, etcd disk usage, mvcc database size]
use_cases: [cluster-maintenance, etcd-health, proactive-operations, capacity-planning]
related_docs: [day-2-operations.md, backup-restore.md, troubleshooting.md]
last_updated: 2026-05-05
---

# etcd Maintenance and Defragmentation

Monitoring, diagnosing, and resolving etcd fragmentation on OpenShift clusters.

---

## Overview

etcd stores all Kubernetes cluster state. Over time, compaction frees logical space but does not reclaim physical disk pages, causing the backend B-tree to grow. Without periodic defragmentation, etcd DB files can be orders of magnitude larger than live data, leading to increased memory usage, slower I/O, and eventually OOM kills or quota exhaustion.

---

## Key Metrics

### Fragmentation Ratio

```
etcd_mvcc_db_total_size_in_bytes / etcd_mvcc_db_total_size_in_use_in_bytes
```

| Ratio | Status | Action |
|-------|--------|--------|
| < 2.0 | Healthy | No action needed |
| 2.0 - 4.0 | Moderate | Schedule defrag during maintenance window |
| > 4.0 | High | Defrag required — risk of quota exhaustion |

### Monitoring Queries

**Current fragmentation ratio per member**:
```promql
etcd_mvcc_db_total_size_in_bytes{job="etcd"}
  / etcd_mvcc_db_total_size_in_use_in_bytes{job="etcd"}
```

**Physical DB size approaching quota**:
```promql
etcd_mvcc_db_total_size_in_bytes{job="etcd"}
  / etcd_server_quota_backend_bytes{job="etcd"} > 0.8
```

**Predict when DB will hit quota** (linear extrapolation over 6 hours):
```promql
predict_linear(etcd_mvcc_db_total_size_in_bytes{job="etcd"}[6h], 3600 * 24)
  > etcd_server_quota_backend_bytes{job="etcd"}
```

### Health Indicators

Check these alongside fragmentation:

```promql
# Leader presence (must be 1 on exactly one member)
etcd_server_has_leader{job="etcd"}

# Peer round-trip time (should be < 100ms)
histogram_quantile(0.99,
  rate(etcd_network_peer_round_trip_time_seconds_bucket{job="etcd"}[5m]))

# Disk sync duration (should be < 100ms)
histogram_quantile(0.99,
  rate(etcd_disk_wal_fsync_duration_seconds_bucket{job="etcd"}[5m]))
```

---

## Defragmentation Procedure

### Prerequisites

1. Cluster is healthy — all etcd members have a leader
2. etcd backup is current (within the last hour)
3. Maintenance window approved — defrag causes brief per-member unavailability

### Step 1: Take a Fresh Backup

```bash
# On a control-plane node
sudo /usr/local/bin/cluster-backup.sh /home/core/etcd-backup-$(date +%Y%m%d)
```

Or via OpenShift API:
```bash
oc debug node/<control-plane-node> -- chroot /host \
  /usr/local/bin/cluster-backup.sh /home/core/etcd-backup-pre-defrag
```

### Step 2: Identify Members and Current Sizes

```bash
# List etcd members
oc get pods -n openshift-etcd -l app=etcd -o wide

# Check DB sizes per member
for pod in $(oc get pods -n openshift-etcd -l app=etcd -o name); do
  echo "=== $pod ==="
  oc exec -n openshift-etcd $pod -c etcd -- \
    etcdctl endpoint status --write-out=table
done
```

### Step 3: Rolling Defragmentation

Defragment one member at a time. Always start with non-leader members.

```bash
# Identify the leader
oc exec -n openshift-etcd etcd-<control-plane-0> -c etcd -- \
  etcdctl endpoint status --write-out=table

# Defrag a non-leader member
oc exec -n openshift-etcd etcd-<control-plane-1> -c etcd -- \
  etcdctl defrag

# Verify the member rejoined and is healthy
oc exec -n openshift-etcd etcd-<control-plane-1> -c etcd -- \
  etcdctl endpoint health

# Repeat for remaining non-leader members, then the leader last
```

**Wait at least 30 seconds between members** to allow the cluster to stabilize.

### Step 4: Verify Results

```bash
# Compare DB sizes before and after
for pod in $(oc get pods -n openshift-etcd -l app=etcd -o name); do
  echo "=== $pod ==="
  oc exec -n openshift-etcd $pod -c etcd -- \
    etcdctl endpoint status --write-out=table
done
```

Expected: `DB SIZE` should drop significantly, and `DB SIZE IN USE` should be close to `DB SIZE`.

---

## Common Issues

### Defrag Fails with "context deadline exceeded"

The default timeout may be too short for large databases.

```bash
oc exec -n openshift-etcd etcd-<member> -c etcd -- \
  etcdctl defrag --command-timeout=120s
```

### Member OOMKilled During Defrag

Defragmentation temporarily doubles memory usage. If etcd memory limits are tight:
1. Verify current memory limits: `oc get pod etcd-<member> -n openshift-etcd -o jsonpath='{.spec.containers[?(@.name=="etcd")].resources}'`
2. If limits are below 1Gi with a large DB, consider requesting a maintenance window with increased limits

### Fragmentation Returns Quickly After Defrag

Indicates a write-heavy workload pattern. Investigate:
```bash
# Check write rate
oc exec -n openshift-etcd etcd-<member> -c etcd -- \
  etcdctl endpoint status --write-out=json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for ep in data:
  print(f'{ep[\"Endpoint\"]}: revision={ep[\"Status\"][\"header\"][\"revision\"]}')"
```

Common causes:
- Frequent ConfigMap/Secret updates (operators with aggressive reconciliation)
- Lease churn from many short-lived pods
- Custom controllers writing large values

### Auto-Compaction Did Not Prevent Fragmentation

Auto-compaction (`--auto-compaction-retention`) frees **logical** space but does **not** reclaim **physical** disk pages. Compaction is necessary (it marks old revisions for reuse) but defragmentation is the only way to shrink the actual DB file.

---

## PrometheusRule Example

Alert when fragmentation ratio exceeds 4x for 30 minutes:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: etcd-fragmentation
  namespace: openshift-etcd
spec:
  groups:
    - name: etcd-maintenance
      rules:
        - alert: EtcdHighFragmentationRatio
          expr: |
            (etcd_mvcc_db_total_size_in_bytes{job="etcd"}
             / etcd_mvcc_db_total_size_in_use_in_bytes{job="etcd"}) > 4
          for: 30m
          labels:
            severity: warning
          annotations:
            summary: "etcd member {{ $labels.pod }} fragmentation ratio is {{ $value | humanize }}x"
            description: >
              The etcd backend database on {{ $labels.pod }} has a fragmentation
              ratio above 4x, indicating significant wasted disk space from
              compacted but unreclaimed revisions. Schedule defragmentation
              during the next maintenance window.
```

---

## Metric Discovery Protocol

When investigating etcd health with Prometheus tools:

1. **Discover available metrics**: Filter with `{__name__=~"etcd_.*"}` to find all etcd-related metrics
2. **Check metric type**: Use metadata to confirm whether a metric is a gauge (current value) or counter (use `rate()`)
3. **Scope queries**: Add `{job="etcd"}` to target platform etcd, not user-workload exporters
4. **Limit cardinality**: Use `topk(10, ...)` when exploring unknown label sets

---

## References

- [OpenShift etcd backup and restore](https://docs.openshift.com/container-platform/latest/backup_and_restore/control_plane_backup_and_restore/backing-up-etcd.html)
- [etcd maintenance guide](https://etcd.io/docs/v3.5/op-guide/maintenance/)
- [etcd performance benchmarking](https://etcd.io/docs/v3.5/op-guide/performance/)


---

---
title: PVC Capacity Planning
category: operations
sources:
  - title: Expanding persistent volumes
    url: https://docs.openshift.com/container-platform/latest/storage/expanding-persistent-volumes.html
    date_accessed: 2026-05-05
  - title: Prometheus predict_linear
    url: https://prometheus.io/docs/prometheus/latest/querying/functions/#predict_linear
    date_accessed: 2026-05-05
  - title: Kubernaut Demo Scenarios - PVC capacity forecast golden transcript
    url: https://github.com/jordigilh/kubernaut-demo-scenarios/blob/feature/v1.4-new-scenarios/golden-transcripts/pvc-capacity-forecast-pvrunwayshort.json
    date_accessed: 2026-05-05
tags: [pvc, capacity-planning, storage, monitoring, predict-linear, volume-expansion]
semantic_keywords: [pvc capacity, persistent volume expansion, storage forecast, predict_linear, volume full, disk space, storage class, allowVolumeExpansion]
use_cases: [capacity-planning, proactive-operations, storage-management]
related_docs: [storage.md, day-2-operations.md, troubleshooting.md]
last_updated: 2026-05-05
---

# PVC Capacity Planning

Proactive monitoring and expansion of PersistentVolumeClaims before they fill up.

---

## Overview

PVCs that reach capacity cause application failures — databases crash, logs stop writing, and pods enter CrashLoopBackOff. Proactive capacity planning uses Prometheus `predict_linear()` to forecast when a PVC will fill up, giving operators time to expand the volume before impact.

---

## Key Metrics

### Volume Usage

```promql
# Current used bytes per PVC
kubelet_volume_stats_used_bytes{namespace="<ns>"}

# Total capacity per PVC
kubelet_volume_stats_capacity_bytes{namespace="<ns>"}

# Current usage percentage
kubelet_volume_stats_used_bytes{namespace="<ns>"}
  / kubelet_volume_stats_capacity_bytes{namespace="<ns>"} * 100
```

### Forecasting with predict_linear

**Predict usage in 24 hours** (based on 6-hour trend):
```promql
predict_linear(
  kubelet_volume_stats_used_bytes{namespace="<ns>"}[6h],
  3600 * 24
)
```

**PVCs that will exceed 90% in 24 hours**:
```promql
predict_linear(kubelet_volume_stats_used_bytes[6h], 3600 * 24)
  / kubelet_volume_stats_capacity_bytes > 0.9
```

**Estimated hours until full** (runway calculation):
```promql
(kubelet_volume_stats_capacity_bytes - kubelet_volume_stats_used_bytes)
  / deriv(kubelet_volume_stats_used_bytes[6h])
  / 3600
```

### Available Inodes

Inode exhaustion causes "No space left on device" even when disk bytes are available:
```promql
kubelet_volume_stats_inodes_free{namespace="<ns>"}
  / kubelet_volume_stats_inodes{namespace="<ns>"} * 100 < 10
```

---

## Volume Expansion

### Prerequisites

1. **StorageClass must support expansion**: `allowVolumeExpansion: true`
2. **CSI driver must support expansion**: Most modern CSI drivers do (topolvm, csi-cinder, ebs-csi, etc.)
3. **No active snapshot or clone operations** on the PVC

Check StorageClass support:
```bash
oc get storageclass -o custom-columns=\
NAME:.metadata.name,\
PROVISIONER:.provisioner,\
EXPAND:.allowVolumeExpansion
```

### Online Expansion (No Downtime)

Most CSI drivers support online expansion — the volume grows while mounted:

```bash
# Check current PVC size
oc get pvc <pvc-name> -n <namespace> \
  -o jsonpath='{.spec.resources.requests.storage}'

# Expand the PVC
oc patch pvc <pvc-name> -n <namespace> --type merge \
  -p '{"spec":{"resources":{"requests":{"storage":"<new-size>"}}}}'

# Monitor expansion progress
oc get pvc <pvc-name> -n <namespace> -o jsonpath='{.status.conditions[*].type}'
```

The PVC will show a `FileSystemResizePending` condition, then transition to the new size after the kubelet resizes the filesystem.

### Expansion Workflow

```
1. Verify StorageClass allows expansion
2. Check current usage vs capacity
3. Calculate target size (current + growth buffer)
4. Patch PVC with new size
5. Monitor FileSystemResizePending → completion
6. Verify new capacity in kubelet metrics
```

---

## PrometheusRule Example

Alert when a PVC is forecast to fill within 24 hours:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: pvc-capacity-forecast
  namespace: openshift-monitoring
spec:
  groups:
    - name: pvc-capacity
      rules:
        - alert: PVRunwayShort
          expr: |
            predict_linear(kubelet_volume_stats_used_bytes[6h], 3600 * 24)
              > kubelet_volume_stats_capacity_bytes
          for: 15m
          labels:
            severity: warning
          annotations:
            summary: "PVC {{ $labels.persistentvolumeclaim }} in {{ $labels.namespace }} predicted full within 24h"
            description: >
              Based on the write rate over the last 6 hours, PVC
              {{ $labels.persistentvolumeclaim }} in namespace
              {{ $labels.namespace }} is predicted to exceed capacity
              within 24 hours.
```

---

## Common Issues

### StorageClass Does Not Allow Expansion

```
error: persistentvolumeclaims "<name>" could not be patched: admission webhook
"validate.storage.k8s.io" denied: ...allowVolumeExpansion is not enabled
```

Options:
1. Migrate to a StorageClass that supports expansion
2. Create a new, larger PVC and migrate data

### Expansion Stuck at FileSystemResizePending

The kubelet must resize the filesystem, which requires the volume to be mounted. If the pod is not running:

```bash
# Check if a pod is using the PVC
oc get pods -n <namespace> -o json | python3 -c "
import json, sys
pods = json.load(sys.stdin)
for p in pods['items']:
  for v in p['spec'].get('volumes', []):
    pvc = v.get('persistentVolumeClaim', {}).get('claimName')
    if pvc:
      print(f'{p[\"metadata\"][\"name\"]}: {pvc} ({p[\"status\"][\"phase\"]})')
"

# If no pod is running, start a temporary pod to trigger resize
oc run resize-trigger --image=busybox --restart=Never \
  --overrides='{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"<pvc-name>"}}],"containers":[{"name":"resize-trigger","image":"busybox","command":["sleep","30"],"volumeMounts":[{"name":"data","mountPath":"/data"}]}]}}' \
  -n <namespace>
```

### predict_linear Returns Negative Values

A negative prediction means the volume is **shrinking** (data is being deleted faster than written). This is normal for workloads with retention policies. No action needed.

### Metrics Not Available for a PVC

`kubelet_volume_stats_*` metrics are only emitted for **mounted** PVCs. Unbound or unused PVCs will not appear:

```bash
# Check PVC status
oc get pvc -n <namespace> -o custom-columns=\
NAME:.metadata.name,\
STATUS:.status.phase,\
CAPACITY:.status.capacity.storage,\
STORAGECLASS:.spec.storageClassName
```

---

## Metric Discovery Protocol

When investigating PVC capacity with Prometheus tools:

1. **Discover volume metrics**: Filter with `{__name__=~"kubelet_volume_stats.*", namespace="<target>"}` to find available PVC metrics
2. **Check label sets**: Use `kubelet_volume_stats_used_bytes{namespace="<ns>"}` to discover `persistentvolumeclaim` label values
3. **Scope to specific PVC**: Add `{persistentvolumeclaim="<name>"}` for targeted queries
4. **Use `topk()`**: When scanning across namespaces, `topk(10, kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes)` finds the fullest PVCs

---

## References

- [OpenShift expanding persistent volumes](https://docs.openshift.com/container-platform/latest/storage/expanding-persistent-volumes.html)
- [Prometheus predict_linear function](https://prometheus.io/docs/prometheus/latest/querying/functions/#predict_linear)
- [Kubernetes volume health monitoring](https://kubernetes.io/docs/concepts/storage/volume-health-monitoring/)


---

---
title: Database Connection Management
category: operations
sources:
  - title: PostgreSQL pg_stat_activity view
    url: https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW
    date_accessed: 2026-05-05
  - title: Crunchy Data postgres_exporter
    url: https://github.com/CrunchyData/postgres_exporter
    date_accessed: 2026-05-05
  - title: Kubernaut Demo Scenarios - DB connection saturation golden transcript
    url: https://github.com/jordigilh/kubernaut-demo-scenarios/blob/feature/v1.4-new-scenarios/golden-transcripts/db-saturation-databaseconnectionpoolexhausted.json
    date_accessed: 2026-05-05
tags: [database, postgresql, connections, monitoring, performance, connection-pooling]
semantic_keywords: [database connections, connection pool, pg_stat_activity, max_connections, connection leak, connection saturation, pgbouncer, postgresql monitoring]
use_cases: [database-operations, performance-troubleshooting, capacity-planning]
related_docs: [day-2-operations.md, troubleshooting.md]
last_updated: 2026-05-05
---

# Database Connection Management

Monitoring, diagnosing, and resolving PostgreSQL connection saturation on OpenShift.

---

## Overview

PostgreSQL enforces a hard limit on concurrent connections (`max_connections`). When all slots are consumed, new clients receive `FATAL: remaining connection slots are reserved for non-replication superuser connections`. This affects all workloads sharing the database, not just the offending client. Early detection and connection pooling prevent outages.

---

## Key Metrics

### Connection Counts

Requires `postgres_exporter` (ServiceMonitor + Deployment or Sidecar):

```promql
# Active connections by database
pg_stat_activity_count{datname!=""}

# Total connections vs max
pg_stat_activity_count / pg_settings_setting{name="max_connections"}

# Connections by state (active, idle, idle in transaction)
pg_stat_activity_count{state="active"}
pg_stat_activity_count{state="idle"}
pg_stat_activity_count{state="idle in transaction"}
```

### Saturation Detection

**Connection usage above 80%**:
```promql
pg_stat_activity_count
  / on() pg_settings_setting{name="max_connections"} > 0.8
```

**Predict when connections will exhaust** (linear extrapolation):
```promql
predict_linear(pg_stat_activity_count[30m], 3600)
  > on() pg_settings_setting{name="max_connections"}
```

### Long-Running Queries

Queries holding connections for extended periods:
```promql
# Connections open for more than 5 minutes
pg_stat_activity_max_tx_duration{datname!=""} > 300
```

---

## Diagnosing Connection Saturation

### Step 1: Identify Current Connection Usage

```bash
# Connect to PostgreSQL pod
oc exec -n <namespace> deploy/postgresql -- \
  psql -U postgres -c "
    SELECT datname, state, count(*)
    FROM pg_stat_activity
    GROUP BY datname, state
    ORDER BY count(*) DESC;"
```

### Step 2: Find the Connection Leaker

```bash
# Show connections grouped by application/client
oc exec -n <namespace> deploy/postgresql -- \
  psql -U postgres -c "
    SELECT application_name, client_addr, state, count(*)
    FROM pg_stat_activity
    WHERE datname IS NOT NULL
    GROUP BY application_name, client_addr, state
    ORDER BY count(*) DESC;"
```

### Step 3: Identify Long-Held Connections

```bash
# Connections open for more than 5 minutes
oc exec -n <namespace> deploy/postgresql -- \
  psql -U postgres -c "
    SELECT pid, application_name, state, query,
           now() - state_change AS duration
    FROM pg_stat_activity
    WHERE state != 'idle'
      AND now() - state_change > interval '5 minutes'
    ORDER BY duration DESC
    LIMIT 10;"
```

### Step 4: Check max_connections and Reserved Slots

```bash
oc exec -n <namespace> deploy/postgresql -- \
  psql -U postgres -c "
    SHOW max_connections;
    SHOW superuser_reserved_connections;"
```

`superuser_reserved_connections` (default: 3) reserves slots for superuser access even when the pool is exhausted. This is critical for administrative recovery.

---

## Remediation

### Immediate: Terminate Leaking Connections

```bash
# Terminate idle connections from a specific application
oc exec -n <namespace> deploy/postgresql -- \
  psql -U postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE application_name = '<leaker>'
      AND state = 'idle';"
```

### Short-Term: Increase max_connections

```bash
# For OpenShift template-based PostgreSQL
oc set env deploy/postgresql \
  POSTGRESQL_MAX_CONNECTIONS=100 \
  -n <namespace>
```

Increasing `max_connections` is a stopgap. Each connection consumes ~5-10MB of shared memory. Values above 200 require careful memory planning.

### Long-Term: Deploy a Connection Pooler

PgBouncer multiplexes many client connections onto a smaller number of PostgreSQL connections:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pgbouncer
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: pgbouncer
          image: bitnami/pgbouncer:latest
          env:
            - name: POSTGRESQL_HOST
              value: postgresql.<namespace>.svc
            - name: POSTGRESQL_PORT
              value: "5432"
            - name: PGBOUNCER_POOL_MODE
              value: transaction
            - name: PGBOUNCER_DEFAULT_POOL_SIZE
              value: "20"
            - name: PGBOUNCER_MAX_CLIENT_CONN
              value: "200"
```

Pool modes:
- **session**: One server connection per client session (least efficient, most compatible)
- **transaction**: Server connection returned after each transaction (recommended for most workloads)
- **statement**: Server connection returned after each statement (most efficient, incompatible with multi-statement transactions)

---

## PrometheusRule Example

Alert when connection usage exceeds 80% for 5 minutes:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: database-connection-saturation
  namespace: <namespace>
spec:
  groups:
    - name: database-connections
      rules:
        - alert: DatabaseConnectionPoolExhausted
          expr: |
            pg_stat_activity_count > 0.8
              * on() pg_settings_setting{name="max_connections"}
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "PostgreSQL connection pool above 80% ({{ $value }} active)"
            description: >
              PostgreSQL in namespace {{ $labels.namespace }} has
              {{ $value }} active connections, exceeding 80% of
              max_connections. Investigate which workloads are consuming
              connections.
```

---

## postgres_exporter Setup

To expose PostgreSQL metrics to Prometheus:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres-exporter
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: exporter
          image: quay.io/prometheuscommunity/postgres-exporter:latest
          env:
            - name: DATA_SOURCE_NAME
              value: "postgresql://postgres:<password>@postgresql:5432/postgres?sslmode=disable"
          ports:
            - containerPort: 9187
              name: metrics
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: postgres-exporter
spec:
  selector:
    matchLabels:
      app: postgres-exporter
  endpoints:
    - port: metrics
      interval: 30s
```

Connect the exporter as a **superuser** to ensure it can query `pg_stat_activity` even when all regular connection slots are exhausted.

---

## Common Issues

### "FATAL: remaining connection slots are reserved"

All non-superuser slots are consumed. Superuser slots (`superuser_reserved_connections`) are reserved for recovery:

```bash
# Use superuser to investigate (these slots are reserved)
oc exec -n <namespace> deploy/postgresql -- \
  psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

### Exporter Shows Stale Metrics During Saturation

If `postgres_exporter` connects as a regular user, it loses its connection during saturation and reports stale data. Always configure the exporter with superuser credentials.

### Connection Count Doesn't Match Application Expectations

Each pod may open multiple connections (one per thread/goroutine). Check:
```bash
# Connections per client IP
oc exec -n <namespace> deploy/postgresql -- \
  psql -U postgres -c "
    SELECT client_addr, count(*)
    FROM pg_stat_activity
    WHERE datname IS NOT NULL
    GROUP BY client_addr
    ORDER BY count(*) DESC;"
```

---

## Metric Discovery Protocol

When investigating database connections with Prometheus tools:

1. **Discover metrics**: Filter with `{__name__=~"pg_.*"}` to find all postgres_exporter metrics
2. **Check available databases**: `pg_stat_activity_count` has a `datname` label showing per-database counts
3. **Verify exporter health**: `pg_up` should be `1`; if `0`, the exporter lost its database connection
4. **Scope queries**: Add `{namespace="<target>"}` to target a specific PostgreSQL instance

---

## References

- [PostgreSQL pg_stat_activity](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW)
- [PostgreSQL connection defaults](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [PgBouncer documentation](https://www.pgbouncer.org/config.html)
- [postgres_exporter](https://github.com/CrunchyData/postgres_exporter)
