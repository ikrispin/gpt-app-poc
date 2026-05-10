# Certificates

Combined reference for certificate management and rotation in OpenShift.

---
title: Certificate Management
category: security
sources:
  - title: Updating cluster certificates
    url: https://docs.openshift.com/container-platform/latest/security/certificate_types_descriptions/user-provided-certificates-for-api-server.html
    date_accessed: 2026-03-31
  - title: Certificate types and descriptions
    url: https://docs.openshift.com/container-platform/latest/security/certificate_types_descriptions/index.html
    date_accessed: 2026-03-31
tags: [certificates, ssl, tls, certificate-rotation, security, api-server-certs]
semantic_keywords: [certificate management, certificate expiration, tls certificates, certificate rotation, api server certificates, ingress certificates]
use_cases: [certificate-monitoring, security-operations, certificate-renewal]
related_docs: [certificate-rotation.md, security-checklist.md, day-2-operations.md]
last_updated: 2026-03-31
---

# Certificate Management

Certificate lifecycle management in OpenShift clusters.

---

## Certificate Types

### Cluster Certificates (Auto-Managed)

| Certificate | Purpose | Location | Expiration | Auto-Rotated |
|------------|---------|----------|------------|--------------|
| **API Server** | API access | kube-apiserver-certs | 30 days | Yes |
| **etcd** | etcd cluster communication | etcd-certs | 3 years | Yes |
| **Kubelet** | Node authentication | /var/lib/kubelet/pki/ | 1 year | Yes |
| **Ingress** | Default router HTTPS | openshift-ingress | 90 days | Yes (if Let's Encrypt) |

### User Certificates (Manual)

- **Client Certificates** (kubeconfig): 24 hours, auto-renewed on `oc` use
- **Custom Ingress**: User-provided, manual renewal required
- **Application Certs**: Managed by application teams

---

## Checking Certificate Expiration

**API Server**:
```bash
oc get secret -n openshift-kube-apiserver-operator kube-apiserver-to-kubelet-signer \
  -o jsonpath='{.metadata.annotations.auth\.openshift\.io/certificate-not-after}'
```

**Ingress**:
```bash
oc get secret -n openshift-ingress router-certs-default -o jsonpath='{.data.tls\.crt}' | \
  base64 -d | openssl x509 -noout -enddate
```

**etcd** (from control plane node):
```bash
oc debug node/<master-node>
chroot /host
openssl x509 -in /etc/kubernetes/static-pod-resources/etcd-certs/etcd-serving-*.crt -noout -enddate
```

**Check via External Tool**:
```bash
echo | openssl s_client -connect api.<cluster>.<domain>:6443 2>/dev/null | \
  openssl x509 -noout -enddate
```

---

## Certificate Rotation

### Automatic Rotation

OpenShift automatically rotates:
- API server certificates (30 days before expiration)
- Kubelet certificates (approaching expiration)
- Service account tokens (pod lifecycle)

**No manual intervention required** for cluster-managed certificates.

### Manual Rotation Required

**Custom Ingress Certificate**:
```bash
# Update secret with new certificate
oc create secret tls router-certs-default \
  --cert=new-ingress.crt --key=new-ingress.key \
  -n openshift-ingress --dry-run=client -o yaml | oc replace -f -
```

**Custom Route Certificate**:
```bash
oc create secret tls my-route-cert --cert=route.crt --key=route.key -n myapp
```

**Force API Server Rotation** (if auto-rotation fails):
```bash
oc patch kubeapiserver/cluster --type=merge \
  -p '{"spec":{"forceRedeploymentReason":"cert-rotation-'"$(date +%s)"'"}}'
```

---

## Custom Certificate Authority

**Add Custom CA to Cluster**:
```bash
# Create ConfigMap with CA bundle
oc create configmap custom-ca --from-file=ca-bundle.crt=<ca-file> -n openshift-config

# Patch cluster proxy
oc patch proxy/cluster --type=merge -p '{"spec":{"trustedCA":{"name":"custom-ca"}}}'
```

**Custom API Server Certificate**:
```bash
# Create secret
oc create secret tls api-server-cert --cert=api.crt --key=api.key -n openshift-config

# Patch API server
oc patch apiserver cluster --type=merge -p \
  '{"spec":{"servingCerts":{"namedCertificates":[{"names":["api.<cluster>.<domain>"],"servingCertificate":{"name":"api-server-cert"}}]}}}'
```

---

## Certificate Signing Requests (CSR)

**Approve Pending CSRs** (nodes joining or cert renewal):
```bash
# List pending
oc get csr | grep Pending

# Approve specific CSR
oc adm certificate approve <csr-name>

# Approve all (use with caution in trusted environments)
oc get csr -o name | xargs oc adm certificate approve
```

---

## Monitoring

**Prometheus Alert**: `KubeClientCertificateExpiration`
```bash
oc get alerts | grep -i cert
```

**Custom Alert for <30 Days**:
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: certificate-expiration
  namespace: openshift-monitoring
spec:
  groups:
  - name: certificates
    rules:
    - alert: CertificateExpiringSoon
      expr: (openshift_certificate_not_after_seconds - time()) / 86400 < 30
      annotations:
        summary: "Certificate expires in < 30 days"
```

---

## Troubleshooting

### "x509: certificate signed by unknown authority"

**Resolution**: Trust cluster CA
```bash
oc get secret -n openshift-ingress router-ca -o jsonpath='{.data.tls\.crt}' | \
  base64 -d > cluster-ca.crt
sudo cp cluster-ca.crt /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust
```

### "certificate has expired"

**Resolution**: Force rotation
```bash
oc patch kubeapiserver/cluster --type=merge \
  -p '{"spec":{"forceRedeploymentReason":"cert-expired-'"$(date +%s)"'"}}'
```

### CSRs Not Auto-Approved

**Resolution**: Restart approver and manually approve
```bash
oc delete pod -l app=machine-approver -n openshift-cluster-machine-approver
oc get csr -o name | grep Pending | xargs oc adm certificate approve
```

---

## Best Practices

- ✅ Monitor certificate expiration (30-day warning)
- ✅ Trust automatic rotation for cluster certs
- ✅ Plan manual rotation for custom certs (90 days recommended)
- ✅ Use wildcard certs for ingress (`*.apps.<cluster>.<domain>`)
- ✅ Store private keys securely (never commit to Git)
- ✅ Use RSA 2048+ or ECDSA 256+ key sizes

---

## References

- [OpenShift Certificate Types](https://docs.redhat.com/en/documentation/openshift_container_platform/4.18/html/security_and_compliance/certificate-types-and-descriptions)
- [Replacing Ingress Certificate](https://docs.redhat.com/en/documentation/openshift_container_platform/4.18/html/security_and_compliance/cert-manager-operator-managing-certificates)
- [API Server Certificates](https://docs.redhat.com/en/documentation/openshift_container_platform/4.18/html/security_and_compliance/configuring-certificates)
- [Quick Reference](./quick-reference.md)
- [INDEX](./INDEX.md)

---

**Last Updated**: 2026-03-17
**OpenShift Version**: 4.18


---

---
title: Certificate Rotation
category: security
sources:
  - title: Updating cluster certificates
    url: https://docs.openshift.com/container-platform/latest/security/certificate_types_descriptions/user-provided-certificates-for-api-server.html
    date_accessed: 2026-03-31
  - title: Certificate types and descriptions
    url: https://docs.openshift.com/container-platform/latest/security/certificate_types_descriptions/index.html
    date_accessed: 2026-03-31
tags: [certificate-rotation, certificates, security, tls, certificate-renewal]
semantic_keywords: [certificate rotation procedures, automatic rotation, manual rotation, certificate renewal, system certificates, user certificates]
use_cases: [certificate-renewal, security-maintenance, certificate-lifecycle]
related_docs: [certificate-management.md, security-checklist.md, day-2-operations.md]
last_updated: 2026-03-31
---

# Certificate Rotation

Certificate management and rotation procedures for OpenShift clusters.

---

## Overview

OpenShift uses certificates for secure communication between cluster components and for user authentication. This guide covers certificate types, expiration, and rotation procedures.

**Scope**: Understanding certificate lifecycle and renewal using MCP tools.

---

## Certificate Types

### System Certificates

**Purpose**: Internal cluster communication

**Components using certificates**:
- API server
- etcd
- Controller manager
- Scheduler
- Kubelet (node certificates)

**Managed by**: Cluster operators (automatic)

**Expiration**: Typically 1 year from installation

**Auto-renewal**: Yes, starts 8 months before expiration

### User Certificates

**Purpose**: kubeconfig authentication

**Location**: Embedded in kubeconfig file

**Expiration**: Typically 1 year from issuance

**Auto-renewal**: No - requires manual kubeconfig refresh

### Ingress Certificates

**Purpose**: HTTPS for routes and web console

**Types**:
- **Default Router Certificate**: Self-signed, generated at install
- **Custom Certificates**: User-provided for custom domains

**Expiration**: Varies (30-90 days for Let's Encrypt, 1+ years for commercial)

**Renewal**: Depends on certificate source

---

## Checking Certificate Expiration

### Viewing Certificate Dates

**Note**: Certificate management operations are Day-2 operations requiring direct cluster access. These can be performed via:
- `oc` CLI commands with valid kubeconfig
- `openshift-administration` MCP server when using Claude Code with KUBECONFIG set

```bash
# Check API server cert
echo | openssl s_client -connect api.<cluster>.<domain>:6443 2>/dev/null | openssl x509 -noout -dates

# Check ingress cert
echo | openssl s_client -connect console-openshift-console.apps.<cluster>.<domain>:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Automatic Certificate Rotation

### System Certificates (Automatic)

**How it works**:
1. Cluster operators monitor certificate expiration
2. Rotation begins 8 months before expiration (for 1-year certs)
3. New certificates generated
4. Services reloaded with new certificates
5. Old certificates deprecated but still valid during transition

**User action required**: None (fully automatic)

**Monitoring**:
```bash
# Check cluster operator status for certificate rotation issues
oc get clusteroperators

# Look for operators with degraded=true
# Certificate rotation issues show in operator status
```

---

## Manual Certificate Operations

### Forcing Certificate Rotation (Emergency)

**When needed**: Certificate compromised or expiration imminent

**API Server Certificates**:
```bash
# Force rotation by deleting certificate secrets
# Cluster operator regenerates automatically
oc delete secret aggregator-client-signer -n openshift-kube-apiserver
```

**⚠️ Warning**: This triggers service restart; brief API unavailability

### Kubeconfig Certificate Renewal

**Symptom**: Kubeconfig authentication fails with "certificate has expired"

**Solution**: Download new kubeconfig

**For Assisted Installer clusters**: Use the `cluster-creator` skill's credential download functionality or download from Red Hat Hybrid Cloud Console.

**For production clusters**: Contact cluster administrator or use alternative authentication

---

## Custom Ingress Certificates

### Replacing Default Router Certificate

**Scenario**: Replace self-signed cert with trusted certificate

**Prerequisites**:
- Certificate file (PEM format)
- Private key file
- Optional: CA certificate chain

**Process**:

```bash
# 1. Create secret with certificate
oc create secret tls custom-ingress-cert \
  --cert=path/to/tls.crt \
  --key=path/to/tls.key \
  -n openshift-ingress

# 2. Update IngressController to use custom cert
oc patch ingresscontroller default \
  -n openshift-ingress-operator \
  --type=merge \
  -p '{"spec":{"defaultCertificate":{"name":"custom-ingress-cert"}}}'
```

**Result**: All routes use custom certificate

### Let's Encrypt with Cert-Manager (Advanced)

**Scenario**: Automatic certificate renewal with Let's Encrypt

**Prerequisites**:
- cert-manager operator installed
- DNS-01 or HTTP-01 challenge configured

**Pattern**: cert-manager automates certificate issuance and renewal

**Renewal**: Automatic, typically 30 days before expiration

---

## Service Account Token Rotation

### Long-Lived Tokens (Legacy)

**Expiration**: No expiration by default

**Security risk**: High if compromised

**Recommendation**: Migrate to time-bound tokens

### Time-Bound Tokens (Recommended)

**Expiration**: Configurable (default 1 hour)

**Auto-renewal**: Application must request new token before expiration

**Creating time-bound token**:
```bash
# Create time-bound token for service account
oc create token <service-account-name> \
  -n <namespace> \
  --duration=1h
```

**Best practice**: Use projected volumes in pods (automatic rotation)

---

## etcd Certificates

### Automatic Rotation

**Frequency**: Every 90 days automatically

**User action**: None required

**Monitoring**:
```bash
# Check etcd operator status for certificate rotation progress
oc get clusteroperator etcd -o yaml
```

### Manual Rotation (Recovery)

**Only if**: etcd cluster unhealthy due to certificate issues

**Procedure**: Contact Red Hat support (complex recovery scenario)

---

## API Server Certificate Rotation

### Normal Rotation

**Trigger**: Automatic, 8 months before expiration

**Process**:
1. New certificates generated
2. API server reloaded (brief unavailability, <10 seconds)
3. Old certificates remain valid for transition period

**User impact**: Minimal, brief API interruptions during reload

### Checking API Server Cert Status

```bash
# Check API server status
oc get apiserver cluster -o yaml

# Look in status.conditions for certificate-related messages
```

---

## Kubelet (Node) Certificates

### Bootstrap Process

**Initial**: Nodes get certificates during join process

**Expiration**: 1 year

**Renewal**: Automatic via kubelet certificate rotation

**Monitoring**:
```bash
# Check node status and conditions
oc get node <node-name> -o yaml

# Check node certificate expiration
oc get node <node-name> -o jsonpath='{.status.conditions[?(@.type=="Ready")].message}'
```

### Failed Rotation Recovery

**Symptom**: Node shows "NotReady" due to expired certificate

**Solution**:
```bash
# List pending certificate signing requests
oc get csr

# Approve CSRs for the node
oc adm certificate approve <csr-name>
```

---

## Certificate Expiration Monitoring

### Alerts

OpenShift provides built-in alerts for certificate expiration:

**Alert names**:
- `KubeClientCertificateExpiration`
- `KubeAPIServerClientCertificateExpiration`

**Check alerts**:
```bash
# View PrometheusRule for certificate alerts
oc get prometheusrules -n openshift-monitoring
```

### Manual Checks

**Script to check all certificates** (reference):
```bash
# Check all secrets with type kubernetes.io/tls
# Extract certificate data
# Parse expiration dates
# Alert on certificates expiring in <30 days
```

---

## Troubleshooting

### Certificate Authentication Failures

**Symptom**: "x509: certificate has expired" errors

**Checks**:
1. Verify certificate expiration date
2. Check system time on client and server (time sync critical)
3. Verify certificate chain is complete

**Solutions**:
- Expired kubeconfig → Download new kubeconfig
- Expired system cert → Wait for automatic rotation or force rotation
- Time skew → Fix NTP configuration

### Certificate Rotation Stuck

**Symptom**: Cluster operator degraded, certificate not rotating

**Checks**:
```bash
# Check operator status for error messages
oc get clusteroperator <operator-name> -o yaml

# Check status.conditions for error messages
```

**Common causes**:
- etcd quorum lost
- Storage issues preventing secret creation
- Operator pod crashed

**Solutions**:
1. Check operator pods running
2. Review operator logs for errors
3. Ensure etcd healthy
4. Verify cluster storage available

### Browser Certificate Warnings

**Symptom**: Browser shows "Your connection is not private" for console

**Cause**: Using self-signed certificate or expired custom cert

**Solutions**:
- Accept risk (development only)
- Install CA certificate in browser (self-signed)
- Replace with trusted certificate (production)

---

## Best Practices

### Monitoring

✅ Set up alerts for certificates expiring within 30 days
✅ Regularly check ClusterOperator status
✅ Monitor ingress certificate expiration separately
✅ Track kubeconfig expiration for automation accounts

### Renewal Strategy

✅ Use automatic rotation for system certificates (default)
✅ Plan custom certificate renewal (Let's Encrypt or manual)
✅ Test certificate rotation in non-production first
✅ Keep backup kubeconfig during rotation

### Security

✅ Rotate compromised certificates immediately
✅ Use time-bound service account tokens
✅ Limit certificate validity periods (shorter = more secure)
❌ Don't disable automatic rotation
❌ Don't use long-lived certificates for applications

---

## Related Documentation

- [Credentials Management](./credentials-management.md) - Kubeconfig and authentication
- [Security Checklist](./security-checklist.md) - Security verification

---

## Official References

- [OpenShift Certificate Management](https://docs.openshift.com/container-platform/latest/security/certificate_types_descriptions.html)
- [Rotating Certificates](https://docs.openshift.com/container-platform/latest/security/certificate_types_descriptions/service-ca-certificates.html)
