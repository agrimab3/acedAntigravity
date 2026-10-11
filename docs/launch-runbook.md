# ACED launch-day runbook

**Do not perform these steps until the owner explicitly authorizes public launch.** Work only from `backup-oct9`, not `main`. Never paste credentials into chat or Git. Keep Caddy Basic Auth until all preflight checks pass.

## 1. Verify backups and the release

```bash
ssh ubuntu@77.113.137.93
cd /home/ubuntu/apps/aced/current
readlink -f /home/ubuntu/apps/aced/current
pm2 status
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3005/api/health
bash scripts/backup-db.sh
```

Confirm backup completed and an offsite copy is accessible. Confirm Dec 5 Form A is locked and registration capacity/time-zone handling is correct.

## 2. Stripe LIVE mode — only when ready to accept money

1. In Stripe Dashboard switch from **Test** to **Live**. Verify account and business setup is complete.
2. Create the live webhook at `https://aceditprep.com/api/stripe/webhook`, listening for `checkout.session.completed` and `checkout.session.expired`. This creates a **different** `whsec_…` signing secret from test mode.
3. Edit `/home/ubuntu/apps/aced/shared/.env` with `nano` and replace `STRIPE_SECRET_KEY` with the `sk_live_…` value, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_PUBLISHABLE_KEY` with `pk_live_…`, and `STRIPE_WEBHOOK_SECRET` with the live webhook signing secret. Do not print or commit the values. Keep `MOCK_TEST_AUTH_MODE=google` and `MOCK_TEST_PAYMENT_MODE=stripe`.
4. The test-only checker (`scripts/check-launch-config.mjs`) intentionally expects test prefixes; it will flag live keys after this change. **That is expected in live mode**, but manually verify key prefixes without exposing values. Never mix test and live credentials.
5. From the checked-out release root run `GITHUB_SHA=launch-live bash scripts/deploy-vps.sh`. This builds with the new public key, restarts PM2 and checks health. Test an authorized small live payment and confirm a signed webhook, registration and receipt; refund the test transaction according to your policy.

## 3. Email, monitoring and scheduled tasks

- Check the Resend dashboard for the account's actual daily/monthly sending allowance, domain verification and bounce status. Verify `EMAIL_FROM` uses `support@aceditprep.com` and six templates render correctly.
- Set up UptimeRobot: HTTPS monitor `https://aceditprep.com/` with 5-minute interval and alerts to the owner. While Basic Auth is enabled, use an allowed public URL; after launch monitor a protected application endpoint as well, with a dedicated health check rather than storing a personal password in monitoring.
- Confirm `CRON_SECRET`, `ADMIN_EMAILS`, Sentry DSNs, the content-factory key, Google OAuth callback URL and the Stripe webhook secret. Run `node scripts/check-launch-config.mjs --env=/home/ubuntu/apps/aced/shared/.env` for name-only diagnostics (test-mode prefixes only).
- Verify the scheduled mock-test release job and backups are installed: `crontab -l` (do not share output if it includes private data).

## 4. Remove Caddy password — only after owner approval

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-launch-backup
sudo nano /etc/caddy/Caddyfile
```

Remove **only** the `basicauth { ... }` directive inside the protected `handle` block, retaining both reverse proxies, public-route definitions and HTTPS configuration. Never paste the password hash into chat.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -I https://aceditprep.com/
curl -I https://aceditprep.com/mock-test
```

Verify public pages, login, dashboard access controls, rate limits, payment/webhook delivery, and admin authorization. Removing Caddy authentication **must not** make owner-only `/admin` accessible to normal students.

## 5. Final smoke test

- Check homepage on desktop and phone, registration, Google sign-in/out, payment, signed webhook, confirmation email, waitlist, reminders, tutor, calculator, practice sections and review.
- Confirm English/Math/Reading/Science timing, locked question counts and checksum, break behavior, and recovery from a disconnected session.
- Verify production logs and Sentry for errors; confirm Stripe and Resend delivery status.
- Confirm DNS/HTTPS, backups, uptime alert delivery and the support mailbox.

## 6. Rollback if something breaks

For a bad code deployment:

```bash
ssh ubuntu@77.113.137.93
cd /home/ubuntu/apps/aced/current
bash scripts/rollback-vps.sh
pm2 status
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3005/api/health
```

If the Caddy change caused a problem:

```bash
sudo cp /etc/caddy/Caddyfile.pre-launch-backup /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

If payment setup fails, **disable new checkout/signups first**, investigate Stripe webhook deliveries and event deduplication, and do not change keys blindly. Reverting code does **not** undo payments or database migrations. Restore the database only after checking backup freshness and data-loss implications; use `scripts/restore-backup.sh` according to its usage instructions.
