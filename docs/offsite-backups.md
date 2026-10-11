# Off-server database backups (not enabled)

Create an **S3 bucket** in AWS (same region as Lightsail, Ohio `us-east-2`), with **Block all public access ON**, **versioning ON**, and **default SSE-S3 encryption ON**. Give it a unique name, e.g. `aced-db-backups-<unique-suffix>`.

Create an IAM policy allowing only `s3:PutObject` on `arn:aws:s3:::YOUR_BUCKET/database/*` and `s3:ListBucket` on `arn:aws:s3:::YOUR_BUCKET`. Create a dedicated IAM identity with only this policy; store its credentials securely on the server, never in Git or chat. Prefer an instance role/short-lived credentials if supported. Set a bucket lifecycle policy to expire old backup versions after an agreed retention period (e.g. 90 days), and consider Object Lock if immutability is required. Configure AWS billing alerts.

On the server, install AWS CLI v2 and configure the limited AWS credentials, then set `ACED_BACKUP_S3_BUCKET` and `ACED_BACKUP_S3_REGION=us-east-2` in a root/owner-readable environment file. Run `scripts/backup-db.sh` to create a fresh dump, then `scripts/backup-offsite-s3.sh` to upload it. Verify with `aws s3 ls s3://YOUR_BUCKET/database/` and periodically test restoring a downloaded dump in a separate database. **No cron or upload is enabled by this change.**
