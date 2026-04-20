# Real-Time Study Room

A full-stack study room application with:

- `frontend/` for the UI
- `backend/` for auth, rooms, chat, sockets, and moderation APIs
- `ai/` for AI moderation rules and related logic

## Project structure

```text
Real-Time-Study-Room/
  ai/
    moderation/
    models/
  backend/
    config/
    controllers/
    middleware/
    models/
    routes/
  frontend/
    js/
  package.json
  README.md
```

## Install

Backend dependencies:

```powershell
cd backend
npm install
```

Frontend uses the local `frontend/server.js` static server, so Node.js is enough.

## Run from root

Backend:

```powershell
npm run start:backend
```

Frontend:

```powershell
npm run start:frontend
```

## Run manually

Backend:

```powershell
cd backend
node server.js
```

Frontend:

```powershell
cd frontend
node server.js
```

## Open in browser

- `http://localhost:5500/login`

## Notes

- Backend reads Mongo settings from `backend/.env`
- Root `.gitignore` ignores dependencies and backend secrets
- The current codebase is now structured cleanly for GitHub, and can be refactored further toward the `Study-Room-Real` architecture from here
