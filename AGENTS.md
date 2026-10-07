# Development and deployment

- Verify changes locally first. Do not push changes to `main`, trigger Hostinger deployment, or deploy the website unless the user explicitly requests deployment after reviewing the changes.
- Local manual verification uses the existing Hostinger MariaDB connection from ignored `.env.local`. Keep credentials out of source, logs, and Git.
- Run `npm run dev:hosting-db` for a loopback-only development server. Its HTTP authentication settings apply only to that local process; production keeps HTTPS.
- This database contains live data. Do not run seeds, destructive integration tests, resets, or migrations against it as part of routine verification. Use temporary databases for automated integration tests.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
