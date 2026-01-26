# MLRun Kubernetes Deployment

Kubernetes manifests for deploying MLRun to a cluster.

## Prerequisites

- Kubernetes cluster (1.25+)
- kubectl configured to access your cluster
- Container images built and available (see below)

## Quick Start

### 1. Build Container Images

Build and push the MLRun images to a registry accessible by your cluster:

```bash
# From the repository root
docker build -t your-registry/mlrun-api:latest \
  -f infra/docker/Dockerfile.rust --target api .

docker build -t your-registry/mlrun-ui:latest \
  -f infra/docker/Dockerfile.ui .

# Push to your registry
docker push your-registry/mlrun-api:latest
docker push your-registry/mlrun-ui:latest
```

### 2. Update Image References

Edit the deployment files to use your registry:

```bash
# Update api.yaml
sed -i 's|mlrun-api:latest|your-registry/mlrun-api:latest|g' base/api.yaml

# Update ui.yaml
sed -i 's|mlrun-ui:latest|your-registry/mlrun-ui:latest|g' base/ui.yaml
```

### 3. Configure Secrets

**Important**: Update the Secret manifest in `base/configmap.yaml` before deploying.

```bash
# Generate a secure API key
openssl rand -hex 32

# Generate a Secret manifest and replace the Secret block in base/configmap.yaml
kubectl create secret generic mlrun-secrets \
  --namespace mlrun \
  --from-literal=CLICKHOUSE_PASSWORD='your-secure-password' \
  --from-literal=POSTGRES_PASSWORD='your-secure-password' \
  --from-literal=MINIO_ACCESS_KEY='your-access-key' \
  --from-literal=MINIO_SECRET_KEY='your-secure-secret' \
  --from-literal=MLRUN_API_KEY='your-api-key' \
  --dry-run=client -o yaml > /tmp/mlrun-secrets.yaml
```

### 4. Deploy with Kustomize

```bash
# Preview what will be created
kubectl apply -k base/ --dry-run=client

# Deploy
kubectl apply -k base/

# Check status
kubectl get pods -n mlrun
kubectl get services -n mlrun

# Check migration jobs
kubectl get jobs -n mlrun
kubectl logs job/postgres-migrations -n mlrun
kubectl logs job/clickhouse-migrations -n mlrun

# Re-run migrations after changes
kubectl delete job/postgres-migrations clickhouse-migrations -n mlrun
kubectl apply -k base/
```

### 5. Access MLRun

```bash
# Port forward the UI
kubectl port-forward -n mlrun svc/ui 3000:3000

# Port forward the API
kubectl port-forward -n mlrun svc/api 3001:3001

# Access the UI at http://localhost:3000
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Kubernetes Cluster                   │
│                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │     UI      │────▶│     API     │────▶│  ClickHouse │   │
│  │  (Next.js)  │     │   (Rust)    │     │  (Metrics)  │   │
│  └─────────────┘     └──────┬──────┘     └─────────────┘   │
│                             │                               │
│                             ├────────────▶┌─────────────┐   │
│                             │             │  PostgreSQL │   │
│                             │             │  (Metadata) │   │
│                             │             └─────────────┘   │
│                             │                               │
│                             ├────────────▶┌─────────────┐   │
│                             │             │    MinIO    │   │
│                             │             │ (Artifacts) │   │
│                             │             └─────────────┘   │
│                             │                               │
│                             └────────────▶┌─────────────┐   │
│                                           │    Redis    │   │
│                                           │   (Cache)   │   │
│                                           └─────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components

| Component | Type | Description | Storage |
|-----------|------|-------------|---------|
| api | Deployment | HTTP + gRPC API server | - |
| ui | Deployment | Next.js web dashboard | - |
| postgres | StatefulSet | Metadata storage | 10Gi PVC |
| clickhouse | StatefulSet | Metrics storage | 50Gi PVC |
| minio | StatefulSet | Artifact storage | 50Gi PVC |
| redis | Deployment | Caching | - |

## Customization

### Using Kustomize Overlays

Create an overlay for your environment:

```bash
mkdir -p infra/k8s/overlays/production
```

Create `infra/k8s/overlays/production/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - ../../base

namespace: mlrun-prod

images:
  - name: mlrun-api
    newName: your-registry/mlrun-api
    newTag: v1.0.0
  - name: mlrun-ui
    newName: your-registry/mlrun-ui
    newTag: v1.0.0

patchesStrategicMerge:
  - resources.yaml
```

### Resource Customization

Create `infra/k8s/overlays/production/resources.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "2000m"
```

### Ingress

Add an Ingress for external access:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mlrun
  namespace: mlrun
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - mlrun.your-domain.com
      secretName: mlrun-tls
  rules:
    - host: mlrun.your-domain.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 3001
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ui
                port:
                  number: 3000
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n mlrun
kubectl describe pod <pod-name> -n mlrun
kubectl logs <pod-name> -n mlrun
```

### Database Connectivity

```bash
# Test PostgreSQL
kubectl exec -it postgres-0 -n mlrun -- psql -U mlrun -d mlrun -c "SELECT 1"

# Test ClickHouse
kubectl exec -it clickhouse-0 -n mlrun -- clickhouse-client \
  --user mlrun --password mlrun_dev --query "SELECT 1"
```

### Reset Everything

```bash
# Delete all resources
kubectl delete -k base/

# Delete PVCs (DESTRUCTIVE!)
kubectl delete pvc -n mlrun --all
```

## Production Considerations

1. **Use proper secrets management** (e.g., Vault, Sealed Secrets)
2. **Enable TLS** for all services
3. **Configure resource limits** appropriately
4. **Set up monitoring** (Prometheus, Grafana)
5. **Configure backup** for persistent volumes
6. **Use network policies** to restrict traffic
7. **Consider using managed databases** (RDS, Cloud SQL) for production
