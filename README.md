# Cove

Cove is a private, real-time space for direct messages and small group circles. It combines live chat, member-only rooms, email OTP verification, and Supabase-backed file sharing in a responsive glassmorphism interface.

## Highlights

- Real-time direct messages and private circles with Socket.IO
- Email/password login plus passwordless OTP login
- Email verification for new accounts through Resend
- Username search and live availability checks
- Invite-only circle membership and member directory
- Image, PDF, document, text, and ZIP sharing (15 MB limit)
- Shared images and links library for every conversation
- Live online-member count inside open conversations
- Owner-only member removal for private circles
- Drag-and-drop uploads, emoji picker, keyboard shortcuts, toast feedback
- Responsive mobile chat navigation
- Reduced-motion support and accessible control labels
- Supabase PostgreSQL and Storage integration
- Render-ready Express server

## Project structure

\`\`\`text
cove-app/
├── public/                 # Landing, authentication, chat UI and client scripts
├── server/
│   ├── db.js               # PostgreSQL queries and schema initialization
│   ├── server.js           # Express API and Socket.IO server
│   └── storage.js          # Supabase Storage uploads
├── .env.example
├── package.json
└── README.md
\`\`\`

## Run locally

1. Install Node.js 18 or newer.
2. Install packages:

   \`\`\`bash
   npm install
   \`\`\`

3. Copy \`.env.example\` to \`.env\` and add your own values.
4. Start the app:

   \`\`\`bash
   npm start
   \`\`\`

5. Open \`http://localhost:3000\`.

Never commit \`.env\`. The included \`.gitignore\` keeps it out of Git.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| \`DATABASE_URL\` | Supabase PostgreSQL connection string |
| \`SUPABASE_URL\` | Supabase project URL |
| \`SUPABASE_SERVICE_ROLE_KEY\` | Server-only key used for Storage uploads |
| \`SUPABASE_STORAGE_BUCKET\` | Storage bucket name |
| \`RESEND_API_KEY\` | Resend API key for verification emails |
| \`EMAIL_FROM\` | Verified sender address |
| \`PORT\` | Server port; Render supplies this automatically |

The service-role key must only exist on the server or in Render environment variables. Do not put it in browser code.

## Deploy on Render

- **Runtime:** Node
- **Build command:** \`npm install\`
- **Start command:** \`npm start\`
- Add all values from \`.env.example\` in Render’s Environment settings.
- Keep your current Supabase database and bucket; this redesign does not require a schema migration.
- After deployment, confirm registration email, password login, OTP login, DMs, circles, and file uploads.

## Keyboard and mobile behavior

- \`Ctrl/⌘ + K\` focuses username search.
- \`Enter\` sends a message; \`Shift + Enter\` adds a new line.
- \`Escape\` closes an open modal or emoji picker.
- On mobile, opening a conversation switches to a dedicated thread view with a back button.

## Security notes

Sessions and pending OTP codes currently live in server memory. They are cleared whenever the Render service restarts, and multiple Render instances will not share them. For production scale, move sessions and OTP records to a shared store with expiry and add rate limiting to authentication endpoints.
