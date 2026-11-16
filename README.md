# Open Tale – Hostinger deployment

A traditional Node.js + Express server with one entry point (`server.js`),
one routing file (`src/routes/index.js`), and a SQLite database file that stays on disk.
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
    ├── db.js                 SQLite database (persistent file) and tables
    ├── seed.js               Admin account and demo posts
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
| `ADMIN_PASSWORD` | a strong password |
| `COOKIE_SECURE` | `true` (after SSL is active) |
| `DB_FILE` | `/home/<your-user>/opentale-data/opentale.db` |
| `UPLOAD_DIR` | `/home/<your-user>/opentale-data/uploads` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | your email provider settings |

## 5. Install and start

1. Click **Run NPM Install** (or run `npm install`).
2. Click **Restart** (or **Start**).
3. Open your domain. The login page is at `/login.html`.

On the first start the admin account is created and six demo posts are added.

## Local testing (optional)

```
npm install
npm start
```

Then open http://localhost:3000/login.html. Without environment variables the server uses
`data/opentale.db` and `uploads/` inside the project, and verification codes print in the terminal.

## Notes

- **Backups:** copy the `opentale-data` folder regularly (database and uploaded images).
- **Redeploys:** because the database and uploads live outside the app folder,
  uploading new code does not delete accounts or posts.
- **Old data:** accounts and posts from the Vercel version are not copied automatically.
- **Native module:** `better-sqlite3` is installed with npm. If `npm install` fails on Hostinger
  with a build error, contact Hostinger support or ask me to switch to a pure-JavaScript SQLite option.
- **Email:** without SMTP settings, verification codes are printed in the server log
  (hPanel Node.js logs), which is useful for testing only.
- **Content rules:** vulgar and 18+ words are blocked by `src/utils/moderation.js`.
