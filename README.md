# TaskCanvas — Frontend

Next.js (App Router) + TypeScript client for TaskCanvas: JWT login, a
drag-and-drop Kanban board filtered by date, and an image-annotation tool with
polygon drawing on a canvas.

Backend repo: https://github.com/ehsan-0801/TaskCanvas-Backend

---

## Tech stack

- **Node.js 22** (developed on 22.22.2), **npm 10**
- **Next.js 16** (App Router) + **TypeScript** (strict, TS-only)
- **Tailwind CSS 4**
- **Zustand** — shared selected-date state
- **@dnd-kit** — drag-and-drop between Kanban columns
- **react-konva** — polygon drawing canvas
- **react-hook-form + zod** — task form + validation
- **axios** — API client with JWT attach + auto-refresh interceptor

---

## Setup & run (local)

> Start the [backend](https://github.com/ehsan-0801/TaskCanvas-Backend) first —
> the frontend needs it running (default `http://127.0.0.1:8000`).

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the Django backend (e.g. `http://127.0.0.1:8000`) |

### 3. Run the dev server

```bash
npm run dev                       # http://localhost:3000
```

Open http://localhost:3000 and log in with the demo credentials:

**Demo credentials:** `demo@example.com` / `demo12345`

### Other scripts

```bash
npm run build                     # production build
npm run start                     # serve the production build
npm run lint                      # eslint
```

---

## Routes

| Route | Access | Purpose |
|---|---|---|
| `/login` | Public | Email/password login |
| `/tasks` | Protected | Kanban board (To Do / In Progress / Done) |
| `/annotate` | Protected | Image upload + polygon annotation |

Protected routes redirect to `/login` when there is no valid session.

---

## Deployment (Vercel)

- Import the repo into Vercel.
- Set `NEXT_PUBLIC_API_URL` to the deployed backend URL.
- Set the resulting Vercel domain as `CORS_ALLOWED_ORIGINS` in the backend's env.

---

## Difficulties faced and how solved

- **JWT refresh caused duplicate/racing network calls.** When several requests
  hit a 401 at once, each tried to refresh the token. **Fix:** the axios
  response interceptor coalesces concurrent refreshes into a single in-flight
  promise and replays the original request once, only redirecting to `/login`
  after a failed refresh (`src/lib/api.ts`).

- **Tokens live in React state, but interceptors run outside React.** **Fix:** a
  small "auth bridge" — the `AuthProvider` registers getter/setter accessors that
  the axios interceptors read, keeping tokens out of module-level globals while
  still reachable from non-React code (`src/lib/api.ts` + `src/context/AuthContext.tsx`).

- **react-konva crashed during SSR.** It touches the browser `canvas` API, which
  doesn't exist on the server. **Fix:** load the canvas via
  `next/dynamic` with `ssr: false` and a loading spinner (`src/app/annotate/page.tsx`).

- **Polygons had to survive canvas resizing.** A shape drawn at one canvas size
  must render correctly at another. **Fix:** store all polygon points as
  **normalized 0–1 coordinates** and denormalize to the current stage size on
  render, with a `ResizeObserver` keeping the stage responsive
  (`src/components/annotate/AnnotationCanvas.tsx`).

- **Vertex editing + zoom/pan broke coordinate math.** Once the stage could be
  zoomed and panned, raw pointer positions no longer mapped to image space, so
  dragging a vertex or adding a point landed in the wrong place. **Fix:** read the
  pointer with Konva's `getRelativePointerPosition()`, which undoes the stage's
  scale/offset, so every polygon coordinate stays in the image's own 0–1 space
  regardless of zoom; stroke/handle sizes are divided by the scale so they stay a
  constant on-screen size. Dragging a handle persists via `PATCH .../polygons/:id`
  with the new normalized points.

- **Mutations felt slow waiting on the network.** Creating, editing, and deleting
  tasks and reshaping polygons all **update the UI optimistically** and roll back
  on failure. Task creation inserts a temporary card and reconciles it with the
  server id, and deletes surface an **Undo** action in the toast that recreates the
  task.

- **DateSelector had to stay decoupled from task logic.** **Fix:** the selected
  date lives in a standalone Zustand store (`src/store/useDateStore.ts`) and
  `<DateSelector/>` is a pure presentational control — the board reads the date
  from the store, so the two share no task-specific code.

- **Drag-and-drop felt laggy against network latency.** **Fix:** optimistic
  updates — the board reorders locally immediately and rolls back to the previous
  state if the `reorder` request fails.

- **Search/tag filtering could corrupt drag ordering.** Reorder persists each
  card's `order` from its index within a column, so dragging inside a *filtered*
  view would renumber only the visible cards and desync the hidden ones. **Fix:**
  drag-and-drop is disabled whenever a filter is active (`dndDisabled` threaded
  from the page down to each `useSortable`), so reordering only ever runs against
  the complete, unfiltered list.
