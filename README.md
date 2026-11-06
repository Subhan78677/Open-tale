# Open Tale – Full version (accounts, admin, moderation)

This version needs Node.js, because email verification, bans, posting limits
and the content filter must be enforced on the server.

## 1. Run it in VS Code

1. Install **Node.js 18 or newer** from nodejs.org.
2. Open the `opentale-complete` folder in VS Code.
3. Open the terminal (Terminal → New Terminal) and run:

```bash
npm install
npm start
```

4. Open **http://localhost:3000** in your browser.

Do not use Live Server for this version. The site needs the Node server running.

## 2. Accounts

| Account | Email | Password |
|---|---|---|
| Admin | `admin@opentale.com` | `admin123` |
| Demo user | `sarah@opentale.com` | `password123` |

**Change the admin password before going live.** Set your own before the first start:

- Mac / Linux: `ADMIN_EMAIL=you@mail.com ADMIN_PASSWORD=strongpass npm start`
- Windows PowerShell: `$env:ADMIN_EMAIL="you@mail.com"; $env:ADMIN_PASSWORD="strongpass"; npm start`

Delete `opentale.db` to start again with a fresh database.

## 3. Email verification

New users get a 6-digit code by email when they sign up. The code expires in 10 minutes, and each code allows 5 attempts. After verifying once, they can log in any time without a code.

- **Without email setup:** the code is printed in the VS Code terminal. This is fine for testing.
- **With real email:** set these before `npm start` (example for Gmail):

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourmail@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="Open Tale <yourmail@gmail.com>"
```

For Gmail, create an **App Password** in your Google account (requires 2-Step Verification).

## 4. Posting limits

- Normal users can publish **2 posts every 24 hours**. The Write page shows how many they have left.
- Admins can publish without limits.
- Admins can change the limit and time window in **Admin → Settings**.

## 5. Admin panel (`admin.html`)

Open it from the **Admin** link in the menu (visible to admins only).

- **Users:** see all accounts, ban or unban them, make someone admin or remove admin rights.
  A banned user cannot log in or post, and their existing session stops working immediately.
- **Posts:** delete any post, from any author.
- **Settings:** set the posting limit and time window.

## 6. Content rules (18+ and vulgar content)

The filter in `moderation.js` blocks posts with listed vulgar or 18+ words in the title, summary, tags, or text.
It also catches simple tricks like `f@ck` or `sh1t`.

To change the rules, edit the `BLOCKED_WORDS` list in `moderation.js`. Add the words your community uses, including Urdu and Hindi words.

**Limits to know about:**
- The text filter is a keyword filter, not a human reviewer. It can miss creative spelling and can occasionally block a harmless word that contains a listed word.
- **Images are not checked automatically.** Checking images for nudity or adult content needs an image-moderation service (for example Sightengine or Google Cloud Vision) connected through an API key. If you want that, tell me which service you choose.
- The admin can delete any post or image that breaks the rules, and can ban the user.

## 7. Folder structure

```
opentale-complete/
├── server.js        Routes: accounts, verification, posts, limits, admin
├── db.js            Database tables (SQLite file: opentale.db)
├── seed.js          Admin account and demo posts
├── moderation.js    Vulgar and 18+ word filter
├── mailer.js        Verification email sender
├── package.json
└── public/          Website pages (HTML, CSS, JS, images)
    ├── index.html, blog.html, post.html, write.html, login.html, admin.html
    ├── css/style.css
    ├── js/common.js
    ├── assets/      Logo and photos
    └── uploads/     Images uploaded by writers
```

## 8. Going live

- Set a long random `JWT_SECRET` environment variable.
- Set real `ADMIN_EMAIL` and `ADMIN_PASSWORD` values.
- Run behind HTTPS (for example with Render, Railway, or a VPS and Nginx).
- Back up `opentale.db` and the `public/uploads` folder regularly.
