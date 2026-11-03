# Event Map

An interactive web map of local events for **Astana, Kazakhstan**. Verified businesses publish events by clicking a location on the map. Everyone else can browse, search, filter by time, and build a route to the venue.

Full-stack project: Node.js/Express REST API, SQLite, JWT authentication with role-based access control, and a vanilla-JS frontend built on the 2GIS MapGL and Routing APIs.

> The user interface is in Russian, aimed at the local audience.

---

## Features

**For everyone**
- Interactive 2GIS map centered on Astana with a marker for every event
- Click a marker to see the title, description and date
- Full-text search across event titles and descriptions
- Time filters: *tonight*, *this week*, *this weekend*
- Route builder (driving or walking) from your geolocation to a chosen point. If geolocation is denied, you can pick the start point on the map instead
- Light / dark sidebar theme

**For registered users**
- Sign up and log in (JWT-based sessions)
- Apply for a **business account** by submitting company name, BIN (Business Identification Number), phone, address and website
- See the status of your application (pending)

**For verified businesses**
- Create an event by clicking any point on the map and filling in title, date/time and description
- Delete their own events, individually or all at once

**For administrators**
- Review pending business applications and approve or reject them
- Delete any event, or all events

## Roles and permissions

| Action | Guest | User | Business | Admin |
|---|:---:|:---:|:---:|:---:|
| View / search / filter events | ✅ | ✅ | ✅ | ✅ |
| Build a route | ✅ | ✅ | ✅ | ✅ |
| Apply for a business account | – | ✅ | – | – |
| Create events | – | – | ✅ | ✅ |
| Delete own events | – | – | ✅ | ✅ |
| Delete any event | – | – | – | ✅ |
| Approve / reject applications | – | – | – | ✅ |

**Verification flow:** `register → submit business application → admin approves → role becomes business → user can publish events`

All permission checks are enforced **on the server**, not only hidden in the UI.

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Backend | Express 5 |
| Database | SQLite (`sqlite3`) |
| Auth | JSON Web Tokens (`jsonwebtoken`), password hashing with `bcrypt` |
| Security middleware | `express-rate-limit`, `cors` |
| Frontend | Vanilla JavaScript, HTML, CSS (no framework, no build step) |
| Maps | [2GIS MapGL JS API](https://docs.2gis.com/en/mapgl/overview) and [2GIS Routing API](https://docs.2gis.com/en/api/navigation/routing/overview) |

## How it works

```
┌────────────────────────┐      REST / JSON       ┌──────────────────────────┐
│ Browser (public/)      │  ───────────────────►  │ Express server           │
│  • 2GIS MapGL map      │  ◄───────────────────  │  • JWT auth middleware   │
│  • Event markers       │   Authorization:       │  • Role checks           │
│  • Auth / admin modals │   Bearer <token>       │  • Rate limiting         │
└──────────┬─────────────┘                        └────────────┬─────────────┘
           │                                                   │
           │ route requests                                    ▼
           ▼                                          ┌──────────────────┐
   2GIS Routing API                                   │ SQLite db.sqlite │
                                                      └──────────────────┘
```

1. The server serves the static frontend from `public/` and exposes a REST API.
2. On startup it creates the SQLite database and three tables automatically (`users`, `business_requests`, `events`).
3. On login the server returns a signed JWT (valid for 1 hour) containing the user's `id`, `role` and `verification_status`. The frontend stores it and sends it in the `Authorization` header.
4. The frontend loads all events from `/events`, draws them as map markers, and applies search and time filters client-side.
5. Routes are requested from the 2GIS Routing API directly from the browser and drawn as a polyline on the map.

## Getting started

### Prerequisites
- Node.js 18 or newer
- A free 2GIS API key. Get one in the [2GIS Platform Manager](https://platform.2gis.com/)

### Installation

```bash
git clone https://github.com/<your-username>/Event_map.git
cd Event_map
npm install
```

### Configuration

1. **2GIS key.** Open `public/app.js` and replace the key in `API_KEY` and in the `reqUrl` routing URL with your own.
2. **JWT secret.** Set a long random value in the environment. Without it the server falls back to an insecure default that is only suitable for local development.

   ```bash
   # macOS / Linux
   export JWT_SECRET="replace-with-a-long-random-string"

   # Windows PowerShell
   $env:JWT_SECRET="replace-with-a-long-random-string"
   ```

### Run

```bash
npm start
```

Open **http://localhost:3000**. The database file `db.sqlite` is created on first launch.

### Create the first administrator

The `/admin/create` endpoint works **only once**: it is rejected as soon as any admin exists. Call it right after the first start:

```bash
curl -X POST http://localhost:3000/admin/create \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"choose-a-strong-password"}'
```

Then log in through the UI with those credentials.

### Try the full flow

1. Create the admin (above) and register a regular user.
2. As the user, click **Стать бизнесом** ("Become a business") and submit the form.
3. Log in as the admin, open **Админ панель** ("Admin panel") and approve the application.
4. Log in again as that user (the role is stored in the token, so a fresh login is required) and click anywhere on the map to create an event.

## API reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | – | Create a user account |
| POST | `/login` | – | Returns a JWT (expires in 1 h) |
| POST | `/admin/create` | – | One-time creation of the first admin |
| GET | `/events?limit=&offset=` | – | List events (paginated, default limit 100) |
| POST | `/events` | business / admin | Create an event `{title, description, lat, lng, date}` |
| DELETE | `/events/:id` | owner / admin | Delete one event |
| DELETE | `/events` | business / admin | Delete own events (admin: all events) |
| POST | `/business-request` | user | Submit a business application |
| GET | `/business-status` | user | Status of the latest application |
| GET | `/admin/requests` | admin | List pending applications |
| POST | `/admin/approve/:id` | admin | Approve → user becomes `business` |
| POST | `/admin/reject/:id` | admin | Reject an application |

`/register` and `/login` are rate-limited to 100 requests per 15 minutes per IP.

## Database schema

```
users              id, email (unique), password (bcrypt hash), role, verification_status
business_requests  id, user_id, company_name, bin, phone, address, website, status
events             id, title, description, lat, lng, date, creator_id
```

## Security measures

- Passwords are hashed with **bcrypt** and never stored in plain text
- **JWT** sessions with a 1-hour expiry
- **Role-based access control** enforced in the API
- **Parameterized SQL queries** throughout (protection against SQL injection)
- User-generated content is **HTML-escaped** before rendering (protection against XSS)
- **Rate limiting** on the registration and login endpoints
- CORS restricted to the frontend origin
- Input validation on event and business-application creation

## Project structure

```
Event_map/
├── server.js        # Express app: DB setup, auth, REST API
├── package.json
└── public/
    ├── index.html   # Page layout
    ├── style.css    # Styles and dark theme
    └── app.js       # Map, markers, filters, routing, auth and admin UI
```

## Limitations and roadmap

This is a learning / portfolio project. Planned improvements:

- [ ] Move the 2GIS key into configuration and restrict it by domain in the 2GIS dashboard
- [ ] Email verification and password requirements on sign-up
- [ ] Store the JWT in an `httpOnly` cookie instead of `localStorage`
- [ ] Search and time filters that combine correctly, plus a "show all" reset
- [ ] Event editing, categories and images
- [ ] Automated tests (API integration tests) and CI
- [ ] Docker setup and deployment

## License

ISC
