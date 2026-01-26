# MLRun Local Backup & Restore

Guide for backing up and restoring MLRun data when running the local Docker Compose stack.

## Overview

MLRun stores data in three main systems:

| System | Data | Backup Method |
|--------|------|---------------|
| PostgreSQL | Projects, runs, parameters, API keys | `pg_dump` (logical backup) |
| ClickHouse | Time-series metrics | Native format export |
| MinIO | Artifacts (models, datasets, checkpoints) | `mc mirror` (file sync) |

## Quick Start

### Create a Backup

```bash
cd infra/docker

# Backup to default location (./backups/<timestamp>/)
./scripts/backup.sh

# Backup to custom location
./scripts/backup.sh /path/to/backups
```

### Restore from Backup

```bash
cd infra/docker

# Stop application services first (recommended)
docker compose stop api ui

# Restore
./scripts/restore.sh ./backups/20240101_120000

# Restart services
docker compose start api ui
```

## Backup Contents

Each backup creates a timestamped directory with:

```
backups/
└── 20240101_120000/
    ├── manifest.json              # Backup metadata
    ├── postgres.sql.gz            # PostgreSQL dump (compressed)
    ├── clickhouse_metrics.native.gz    # Metrics table (compressed)
    ├── clickhouse_metrics_summary.native.gz  # Summary table
    ├── clickhouse_schema.sql      # Table schemas
    └── minio.tar.gz               # Artifacts archive
```

## Estimated Time & Disk Usage

| Dataset Size | Backup Time | Disk Space |
|--------------|-------------|------------|
| 1,000 runs, 1M metrics | ~30 seconds | ~50 MB |
| 10,000 runs, 10M metrics | ~2 minutes | ~500 MB |
| 100,000 runs, 100M metrics | ~10 minutes | ~5 GB |

**Note**: Artifact (MinIO) backup time depends heavily on file sizes.

## Backup Locations

### Default Location

Backups are stored in `infra/docker/backups/` by default.

### Custom Location

Specify a custom backup directory:

```bash
./scripts/backup.sh /mnt/external-drive/mlrun-backups
```

## Automated Backups

### Using Cron

Add to your crontab (`crontab -e`):

```bash
# Daily backup at 2 AM
0 2 * * * /path/to/mlrun/infra/docker/scripts/backup.sh /path/to/backups

# Weekly backup on Sunday at 3 AM
0 3 * * 0 /path/to/mlrun/infra/docker/scripts/backup.sh /path/to/backups/weekly
```

### Using systemd Timer

Create `/etc/systemd/system/mlrun-backup.service`:

```ini
[Unit]
Description=MLRun Backup

[Service]
Type=oneshot
ExecStart=/path/to/mlrun/infra/docker/scripts/backup.sh /path/to/backups
User=your-user
```

Create `/etc/systemd/system/mlrun-backup.timer`:

```ini
[Unit]
Description=Daily MLRun Backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl enable --now mlrun-backup.timer
```

## Retention Policy

Implement a retention policy to avoid filling disk:

```bash
# Keep last 7 daily backups
find /path/to/backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;

# Keep last 4 weekly backups
find /path/to/backups/weekly -maxdepth 1 -type d -mtime +28 -exec rm -rf {} \;
```

## Safety Notes

### Before Restore

1. **Stop application services** to prevent data inconsistency:
   ```bash
   docker compose stop api ui
   ```

2. **Create a backup of current data** (if valuable):
   ```bash
   ./scripts/backup.sh ./backups/pre-restore
   ```

3. **Verify backup integrity** by checking the manifest:
   ```bash
   cat ./backups/20240101_120000/manifest.json
   ```

### During Restore

- The restore script will **OVERWRITE** existing data
- PostgreSQL restore uses `--clean --if-exists` (drops and recreates objects)
- ClickHouse tables are truncated before insert
- MinIO files are overwritten if they exist

### After Restore

1. **Restart services**:
   ```bash
   docker compose start api ui
   ```

2. **Verify in UI** at http://localhost:3000

3. **Check logs** for errors:
   ```bash
   docker compose logs api
   ```

## Manual Backup Commands

If you prefer manual control:

### PostgreSQL

```bash
# Backup
docker exec mlrun-postgres pg_dump -U mlrun mlrun > backup.sql

# Restore
cat backup.sql | docker exec -i mlrun-postgres psql -U mlrun mlrun
```

### ClickHouse

```bash
# Backup (JSON format for readability)
docker exec mlrun-clickhouse clickhouse-client \
  --user mlrun --password mlrun_dev \
  --query "SELECT * FROM mlrun.metrics FORMAT JSONEachRow" > metrics.json

# Backup (Native format for efficiency)
docker exec mlrun-clickhouse clickhouse-client \
  --user mlrun --password mlrun_dev \
  --query "SELECT * FROM mlrun.metrics FORMAT Native" > metrics.native

# Restore
cat metrics.native | docker exec -i mlrun-clickhouse clickhouse-client \
  --user mlrun --password mlrun_dev \
  --query "INSERT INTO mlrun.metrics FORMAT Native"
```

### MinIO

```bash
# Backup using mc
docker run --rm --network mlrun-network \
  -v $(pwd)/backup:/backup \
  minio/mc mc mirror minio/mlrun-artifacts /backup/

# Restore using mc
docker run --rm --network mlrun-network \
  -v $(pwd)/backup:/backup:ro \
  minio/mc mc mirror /backup/ minio/mlrun-artifacts/
```

## Troubleshooting

### "Container not running"

Start the required container:
```bash
docker compose up -d postgres clickhouse minio
```

### "Permission denied"

Check Docker socket permissions:
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

### "Network not found"

Ensure the stack is running:
```bash
docker compose up -d
```

### Large Backup Size

- ClickHouse metrics grow over time; consider reducing retention
- Artifacts (models) are often the largest; consider archiving old ones
- Use compression (already enabled by default)

### Slow Backup/Restore

- ClickHouse Native format is faster than JSON
- MinIO backup is I/O bound; consider SSD for backup location
- Large databases may benefit from incremental backup strategies

## Disaster Recovery

### Complete Data Loss

1. Install fresh MLRun stack
2. Start data stores only:
   ```bash
   docker compose up -d postgres clickhouse minio redis
   ```
3. Wait for health checks to pass
4. Run restore:
   ```bash
   ./scripts/restore.sh /path/to/latest/backup
   ```
5. Start application:
   ```bash
   docker compose up -d api ui
   ```

### Partial Recovery

To restore only specific components:

```bash
# PostgreSQL only
gunzip -c backup/postgres.sql.gz | docker exec -i mlrun-postgres psql -U mlrun mlrun

# ClickHouse only
# (see manual commands above)

# MinIO only
# (see manual commands above)
```
