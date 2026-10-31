# KK Special Bakery — full-stack website

This package upgrades the existing KK Special Bakery demo into a Cloudflare Pages Functions application with a D1 database and an R2 image bucket. It includes the website, API endpoints, initial SQL schema, a server-side owner login, image storage, shared menu/settings, order creation, order status changes, customer order tracking, printable bills and PDF sharing where the browser supports file sharing.

## What is included

- `public/index.html` — customer dashboard, owner dashboard and responsive styling.
- `public/_routes.json` — routes API calls through Pages Functions while keeping static website assets static.
- `functions/api/` — server endpoints for bootstrap, login/logout, products, settings, orders, tracking and image storage.
- `functions/_lib/common.js` — server-side session validation and input handling.
- `migrations/schema.sql` — D1 table definitions and starter products/settings.
- `wrangler.toml.example` — optional Wrangler binding template; it contains a placeholder ID and must not be deployed unchanged.

## Important before using real customers

The source code is prepared, but the new Preview deployment still needs its own Cloudflare bindings and secrets before backend testing. Cloudflare must have a D1 database, an R2 bucket, the required bindings and two secrets before the live site can accept orders. Until `/api/bootstrap` reports `backendReady: true`, the live website intentionally disables order submission and owner changes instead of pretending data was saved.

Do not put `OWNER_PASSWORD` or `SESSION_SECRET` inside `index.html`, GitHub source files, screenshots or chat messages. Set them only as Cloudflare secrets.

## Deploy through the Cloudflare Pages dashboard

1. Keep a backup of the currently deployed bakery website and its GitHub repository before replacing files.
2. Upload the contents of this package into the GitHub repository, preserving the `public`, `functions` and `migrations` directories. The `functions` directory must be at repository root, not inside `public`.
3. In Cloudflare Pages, open the connected project and set the build command to blank/no command and the build output directory to `public`. Save the setting and start a new deployment.
4. Use the existing D1 database `kk-bakery-db` that was created for this bakery. Confirm its binding name is `DB`. Do not create a duplicate database. Run `migrations/schema.sql` only if the required tables are missing; do not re-run it unnecessarily against an already initialized database. A separate Preview project should use its own test D1 database when possible.
5. Create a private R2 bucket named `kk-bakery-images` (or use another name). Do not make the bucket publicly writable. The site's API serves saved images through `/api/images/...`.
6. Open the Pages project **Settings → Bindings**. Add a D1 binding with variable name `DB` and select the database. Add an R2 bucket binding with variable name `BAKERY_IMAGES` and select the image bucket. Configure bindings for the Production environment; configure Preview separately only if you use preview deployments.
7. In the project's **Settings → Variables and Secrets**, add `OWNER_PASSWORD` as a secret containing a strong, unique owner password of at least 12 characters, and `SESSION_SECRET` as a secret with at least 32 random characters. Do not reuse an account password. Add both secrets to Production. Redeploy after binding/secret changes so the Functions receive them.
8. Open the Preview deployment's `/api/bootstrap` path. The JSON response should include `"backendReady": true`. If not, use the `missing` and `message` fields to find which setup item is incomplete.
9. Open the live website on two devices. Sign in to Owner Dashboard with the secret owner password, update one menu item and save it; then refresh or wait up to about 15 seconds on the other device to see the shared menu change. Place a small test order and verify it appears in Owner Dashboard. Check order tracking with its order number and the same phone number.
10. Delete the test order only if you add that feature later; currently the owner dashboard intentionally does not provide order deletion. Do not use real customer data until you have tested the workflows and added whatever privacy/contact policy your business needs.

### If you use `wrangler.toml`

Copy `wrangler.toml.example` to `wrangler.toml`, replace `REPLACE_WITH_REAL_D1_DATABASE_ID` with the real database ID, and make sure its bucket/database names match your Cloudflare resources. Never deploy the example with the placeholder ID. If you configure bindings only through the dashboard, you do not need to copy the example file.

## Functional behavior

- Menu products, categories, availability, prices, uploaded images, homepage settings and theme are saved to the shared D1/R2 backend.
- New orders are recalculated on the server using saved prices and delivery settings. The server rejects unavailable products and invalid quantities rather than trusting a total sent by the browser.
- Owner-only endpoints require a signed, time-limited, HttpOnly session cookie. The password itself is stored only as a Cloudflare secret; the browser never receives it back from the server.
- The customer tracker returns order status and total only after matching the order number and phone number.
- Customer pages refresh shared menu/settings every 15 seconds while active. Owner orders refresh on the same interval while the owner remains signed in; order tracking can also be checked manually.
- PDF bill sharing uses the browser's native file-sharing interface if it supports PDF files. Otherwise, the PDF is downloaded and WhatsApp opens with the bill summary; attach the downloaded PDF manually if the browser does not offer the PDF in its share sheet. Printing uses the browser print dialog, where Save as PDF may be available.
- Opening the HTML directly from phone storage is only a local preview. It cannot use the hosted database, secure login or cross-device sync. Use the Cloudflare Pages deployment to test the full-stack behavior.

## Testing

Run `npm run check` in a Node.js environment to check JavaScript syntax and the server-session helper tests. The SQL file can also be executed with SQLite-compatible tooling to verify the table setup. This is not a substitute for testing with the actual Cloudflare bindings and two separate devices.
