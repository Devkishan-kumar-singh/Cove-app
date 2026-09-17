# Cove

Cove is a private real-time chat app with direct messages, admin-managed circles, presence, password login, and Resend email OTP login. The backend uses Firebase Firestore and optional Firebase Storage; no Supabase configuration is required.

## Included

- Email/password and passwordless 6-digit OTP login through Resend
- Private DMs and member-only circles
- Creator/admin-only invitations and removals
- Live online count and per-member online status
- Private WebRTC voice calls in direct chats and circles, with mute and participant presence
- Socket.IO real-time messages and presence
- Firebase-backed users, rooms, memberships, and history
- Optional attachments (15 MB limit)
- Responsive, high-contrast social chat interface

## Firebase setup (Spark/free tier)

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Under **Build → Firestore Database**, create a database in a nearby region using **Production mode**.
3. Open **Project settings → Service accounts → Generate new private key**. Keep this JSON secret; never put it in `public/` or commit it.
4. Encode the JSON as one base64 line in PowerShell:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\service-account.json"))
   ```

5. Copy `.env.example` to `.env` and paste that value into `FIREBASE_SERVICE_ACCOUNT_BASE64`.
6. Publish `firestore.rules` in Firestore's **Rules** tab. Browser access is denied because the Express API performs authentication and membership checks.
7. Optional attachments: upgrade the project to Blaze, create a bucket under **Build → Storage**, put its exact name in `FIREBASE_STORAGE_BUCKET`, and publish `storage.rules`.

As of February 3, 2026, Firebase requires the Blaze plan and a billing account for all Cloud Storage access. Eligible US bucket regions still have an Always Free allowance, but this is not the Spark plan. If you want a strictly no-card Spark setup, leave `FIREBASE_STORAGE_BUCKET` empty: Firestore chat, login, circles, and presence still work, but file uploads do not. A Firebase web API key is not needed because Firebase is accessed only by the server.

## Resend OTP setup

1. Create a [Resend](https://resend.com/) API key.
2. For real users, add and verify your sending domain. The onboarding sender is normally limited to testing with your own account email.
3. Set `RESEND_API_KEY` and an approved sender such as `Cove <login@example.com>` in `EMAIL_FROM`.
4. Registration sends an OTP and creates the user only after verification. Existing users may sign in with password or Resend OTP.

Codes expire after five minutes and allow five attempts. Pending OTPs and sessions live in server memory, so a restart signs users out. Run one server instance unless these are later moved to a shared store.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. Firestore collections are created automatically as the app is used.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | Yes* | Base64 service-account JSON (recommended) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes* | Alternative raw JSON |
| `FIREBASE_STORAGE_BUCKET` | Attachments only | Firebase bucket name |
| `RESEND_API_KEY` | Yes | Sends registration and login OTPs |
| `EMAIL_FROM` | Yes | Resend-approved sender |
| `TURN_URL` | Mobile calls | Comma-separated TURN/TURNS relay URLs |
| `TURN_USERNAME` | Mobile calls | TURN relay username |
| `TURN_CREDENTIAL` | Mobile calls | TURN relay password/credential |
| `PORT` | No | Defaults to 3000 |

*Set exactly one service-account variable.

## Render deployment

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Add the Firebase, Resend, and TURN values under **Environment**.
- Remove old `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_KEY` values; they are unused.

## Firestore layout and privacy

- `users/{email}`: profile and bcrypt password hash
- `usernames/{lowercaseUsername}`: unique username index
- `rooms/{roomId}`: type, creator/admin, and private member email array
- `rooms/{roomId}/messages/{messageId}`: text or attachment messages

The server checks membership before returning history, accepting uploads, joining a Socket.IO room, or saving messages. It checks creator ownership before adding or removing circle members.

Voice calls use Socket.IO only for membership-checked signalling; audio travels peer-to-peer through WebRTC. Calls require HTTPS in production (Render supplies this) and microphone permission. Public STUN servers remain as the fallback, but a TURN relay is strongly recommended for phones and carrier networks. Put every relay endpoint in `TURN_URL`, separated by commas, for example `turn:host:80,turn:host:80?transport=tcp,turn:host:443,turns:host:443?transport=tcp`. Background browser tabs can remain in a call, but a sleeping computer suspends its microphone and network connection.
