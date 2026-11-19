# Open Tale – Hostinger deployment

A traditional Node.js + Express server with one entry point (`server.js`),
one routing file (`src/routes/index.js`), and a Turso (libSQL) cloud database.
No Vercel configuration is used.

## Project structure

```
opentale-hostinger/
├── server.js                 Single entry point (Hostinger starts this file)
├── package.json
├── .env.example              Variables to enter in the Hostinger panel
├── public/                   Website pages, CSS, JavaScript, images (unchanged design)
└── src/
    ├── config.js             All settings from environment variables
    ├── db.js                 Turso (libSQL) connection, tables, and indexes
    ├── seed.js               Admin account (only when ADMIN_EMAIL and ADMIN_PASSWORD are set)
    ├── routes/
    │   ├── index.js          Unified routing: mounts every API router
    │   ├── auth.js           /api/auth/*   register, verify, login, logout, me
    │   ├── posts.js          /api/posts/*  list, create, view, edit, delete, popular, quota, related
    │   ├── admin.js          /api/admin/*  stats, posts, users, bans, roles, settings
    │   └── site.js           /api/*        profile, upload, categories, tags
    ├── middleware/
    │   ├── auth.js           Login, verified-email and admin checks
    │   ├── upload.js         Image uploads saved to disk (JPG/PNG/WEBP/GIF, 5 MB)
    │   └── errors.js         One error handler: JSON responses for every route
    └── utils/                Helpers: errors, posts, auth, moderation, mailer
```

## 1. Prepare the folders on Hostinger

In hPanel open **File Manager** and create a folder outside the app, for example
`/home/<your-user>/opentale-data/`. Inside it, create an empty folder named `uploads`.
The database file `opentale.db` is created there automatically.

## 2. Create the Node.js app

1. In hPanel go to **Websites → Add Website → Node.js Web App** (or open your existing Node.js app).
2. Choose **Node.js version 20 or newer**.
3. Set the **Application root** to the folder where you upload this project.
4. Set the **Application startup file** to `server.js`.

## 3. Upload the project

Upload the contents of this folder (not the folder itself) with **File Manager**,
or connect a GitHub repository in hPanel.

## 4. Set environment variables

In the Node.js app settings, add the variables from `.env.example`.
At minimum set:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | a long random text (required, the server refuses to start without it) |
| `ADMIN_EMAIL` | your admin email |
| `ADMIN_PASSWORD` | a strong password (required to create the admin account) |
| `COOKIE_SECURE` | `true` (after SSL is active) |
| `DATABASE_URL` | your Turso URL, e.g. `libsql://opentale-db-yourname.turso.io` (required) |
| `DATABASE_AUTH_TOKEN` | your Turso auth token (required) |
| `UPLOAD_DIR` | `/home/<your-user>/opentale-data/uploads` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | your email provider settings |

## 5. Install and start

1. Click **Run NPM Install** (or run `npm install`).
2. Click **Restart** (or **Start**).
3. Open your domain. The login page is at `/login.html`.

On the first start the admin account is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. No demo accounts or posts are created.

**Clean URLs:** posts open at `https://yourdomain.com/your-post-slug`. Old `post.html?slug=` and `post.html?id=` links redirect there automatically.

**Deleting users:** in the admin dashboard, click **Delete** next to a user. This removes their account, posts, and uploaded images permanently. Admin accounts must be demoted first, and you cannot delete your own account.

## Local testing (optional)

```
npm install
npm start
```

Then open http://localhost:3000/login.html. Without environment variables the server uses
`data/opentale.db` and `uploads/` inside the project, and verification codes print in the terminal.

## Notes

- **Backups:** use Turso's backup or export tools for the database, and copy the uploads folder regularly.
- **Redeploys:** because the database and uploads live outside the app folder,
  uploading new code does not delete accounts or posts.
- **Old data:** accounts and posts from the Vercel version are not copied automatically.
- **Database:** data lives in Turso, so it is not stored on the Hostinger server. The tables, indexes, and default settings are created automatically on the first start. If the server cannot reach Turso, it stops with a clear error in the logs. Check `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.
- **Local testing without Turso:** if `DATABASE_URL` is empty, a local file `data/opentale.db` is used. This is for development only. Production refuses to start without `DATABASE_URL`.
- **Email:** without SMTP settings, verification codes are printed in the server log
  (hPanel Node.js logs), which is useful for testing only.
- **Content rules:** vulgar and 18+ words are blocked by `src/utils/moderation.js`.
