# Stripe TEST-mode setup for ACED

The live site stays behind Caddy Basic Auth. **Only** `/api/stripe/webhook` is publicly reachable under `/api`. The webhook handler checks the Stripe signature with `STRIPE_WEBHOOK_SECRET` before processing anything.

1. In the Stripe Dashboard, switch to **Test mode**. Copy the **test** secret (`sk_test_…`) and publishable (`pk_test_…`) keys. Never use live keys while testing.
2. Create a webhook endpoint at **https://aceditprep.com/api/stripe/webhook**. Select **`checkout.session.completed`** and **`checkout.session.expired`** (the two event types handled by the current route). Copy its test signing secret (`whsec_…`).
3. Connect to the VPS using your existing SSH key: `ssh ubuntu@77.113.137.93`.
4. Edit the protected server environment: `nano /home/ubuntu/apps/aced/shared/.env`. Set `STRIPE_SECRET_KEY` to the `sk_test_` key, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_PUBLISHABLE_KEY` to the `pk_test_` key, and `STRIPE_WEBHOOK_SECRET` to the **test webhook's** `whsec_` secret. Set `MOCK_TEST_AUTH_MODE=google` and `MOCK_TEST_PAYMENT_MODE=stripe`. Existing Google sign-in uses `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `AUTH_SECRET`; do **not** duplicate them. Do not commit the environment file.
5. Check settings **without printing any values**:

   ```bash
   cd /home/ubuntu/apps/aced/current
   node scripts/check-launch-config.mjs --env=/home/ubuntu/apps/aced/shared/.env
   ```

6. **Rebuild and restart through the existing release script**, which loads the shared environment, runs migrations and health checks, and restarts PM2:

   ```bash
   cd /home/ubuntu/apps/aced/current
   GITHUB_SHA=manual-stripe-test bash scripts/deploy-vps.sh
   ```

7. Check `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3005/api/health` (expect `200`). Test Google sign-in, test-card Checkout, and the Stripe Dashboard webhook delivery logs. An unsigned webhook request must be rejected. Verify the test registration is marked paid only after the signed `checkout.session.completed` event. Confirm expired checkout handling with a test event.

8. Keep Caddy Basic Auth in place until the separate public-launch decision. Test mode is **not** real-money processing. Switch to live keys and a **new live webhook signing secret** only during the launch runbook.
