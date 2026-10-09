# Luca

An interactive dark-romance demo. You text **Luca Vitale**, heir to a New York crime family. A few messages in, he video calls you — a live PopVid Realtime character who answers what you type, on camera, in his own voice. You are never on camera.

- Text chat runs on DeepSeek.
- Video calls run on PopVid Realtime (`r2-realtime-v1`), up to five minutes each.
- Chat history stays in the visitor's browser. There are no accounts.

## Run locally

```bash
cp .env.example .env   # add POPVID_API_KEY and DEEPSEEK_API_KEY
npm install
npm test
npm run dev
```

Open `http://127.0.0.1:5173`.

PopVid fetches `public/luca.jpg` as the first frame, so it needs a public HTTPS origin. Locally, set `PUBLIC_BASE_URL` to a tunnel (for example Cloudflare) that serves the app; without it, calls start without the seed image.

## Deploy

Express serves the built frontend and keeps both keys. Use Render Blueprint with `render.yaml` (free web service, health check `/api/health`). Set `POPVID_API_KEY` and `DEEPSEEK_API_KEY` in the Render dashboard only, never in Git.

## Safety

Luca stays PG-13. Messages about self-harm never reach the models; the visitor is pointed to 988 and the Crisis Text Line instead. The published protocol is at `/safety.html`.
