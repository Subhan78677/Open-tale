# Open Tale – Deploy on Vercel (free)

The site runs as Vercel Serverless Functions. Each file in `api/` is one route.

| Part | Where it runs | Free service |
|---|---|---|
| Pages (HTML, CSS, JS, images) | `public/` | Vercel |
| API routes | `api/` (serverless functions) | Vercel |
| Database (users, posts) | Turso | Turso free tier |
| Uploaded images | Vercel Blob | Vercel Blob free tier |
| Verification emails | Your SMTP provider | e.g. Brevo, Resend, or Gmail app password |

The frontend (`public/`) is unchanged from the previous version.

## 1. Create the free services

**Turso (database)**
1. Sign up at turso.tech and create a database.
2. Copy the database URL (starts with `libsql://`).
3. Create an auth token for that database.

**Vercel Blob (images)**
1. In your Vercel project, open **Storage → Create → Blob** and connect it to the project.
2. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.

## 2. Put the project on GitHub

Upload this folder to a GitHub repository (the `opentale-vercel` folder).

## 3. Deploy on Vercel

1. Go to vercel.com → **Add New → Project** and import the repository.
2. Framework preset: **Other**. Leave build and install commands empty.
   The `vercel.json` file sets the public folder for you.
3. Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `TURSO_DATABASE_URL` | Your `libsql://...` URL from Turso |
| `TURSO_AUTH_TOKEN` | Your Turso token |
| `JWT_SECRET` | A long random text, e.g. 40+ random characters |
| `ADMIN_EMAIL` | Your admin email |
| `ADMIN_PASSWORD` | A strong password for the admin |
| `SMTP_HOST` | Your SMTP server, e.g. `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` (or `465` for SSL) |
| `SMTP_USER` | Your SMTP username |
| `SMTP_PASS` | Your SMTP password or app password |
| `MAIL_FROM` | e.g. `Open Tale <no-reply@yourdomain.com>` |

`BLOB_READ_WRITE_TOKEN` is added by the Blob storage connection in step 1.

4. Click **Deploy**. Vercel gives you a live address such as `https://opentale.vercel.app`.

Users open that address, sign up, enter the code from their email, and log in. No commands are needed.

## 4. Local testing (optional)

Install the Vercel CLI once (`npm i -g vercel`), then in the project folder run:

```
npm install
vercel dev
```

Open the address it prints (usually http://localhost:3000). Without `TURSO_DATABASE_URL`,
the site uses a local file named `opentale.db`. Image uploads need `BLOB_READ_WRITE_TOKEN`
in a `.env.local` file (copy it from the Vercel dashboard).

## 5. Free-tier limits to know

- **Image size:** Vercel limits each request to about 4.5 MB, so images are capped at 4 MB.
- **Blob and Turso:** both have monthly free limits. Check their pricing pages if the site grows.
- **Cold starts:** the first request after a quiet period can take a second or two longer.
- **Existing data:** accounts and posts from the old `opentale.db` file are not copied
  automatically. The new database starts with the admin account and demo posts.

## 6. Folder structure

```
opentale-vercel/
├── api/                      Serverless functions (one file per route)
│   ├── auth/                 register, verify, resend-code, login, logout, me
│   ├── posts/                index (list/create), [slug] (view/edit/delete),
│   │                         related, popular, quota
│   ├── admin/                stats, posts, settings, users, users/[id]
│   ├── categories.js, tags.js, upload.js, profile.js
├── lib/                      Shared code: database, auth, posts, uploads, mail
├── public/                   The website (unchanged design and content)
├── vercel.json               Serves public/ and maps /api/posts/:slug/related
└── package.json
```
