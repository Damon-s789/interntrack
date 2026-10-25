# InternTrack

InternTrack is a personal internship and job application command center. It helps applicants replace scattered spreadsheets and bookmarks with one focused workflow: save an opportunity, monitor deadlines, update its status, and record every follow-up.

![InternTrack dashboard preview](docs/dashboard-preview.svg)

## What it does

- Creates secure, individual accounts with hashed passwords and seven-day signed sessions.
- Tracks company, role, location, work style, status, application date, deadline, salary, job link, and notes.
- Gives every application an activity timeline for recruiter outreach, interview rounds, and reminders.
- Shows an at-a-glance pipeline, interview/offer count, response rate, upcoming deadlines, and recently updated applications.
- Includes server-side search and status filtering, responsive layouts, and graceful empty states.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Semantic HTML, responsive CSS, vanilla JavaScript |
| Backend | Node.js and Express |
| Database | MongoDB using the official Node.js driver |
| Authentication | bcrypt password hashing and JWT bearer tokens |
| Hosting | Render Web Service + MongoDB Atlas |


## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account |
| `POST` | `/api/auth/login` | Sign in |
| `GET` | `/api/dashboard` | Fetch dashboard metrics |
| `GET`, `POST` | `/api/applications` | List or create applications |
| `GET`, `PUT`, `DELETE` | `/api/applications/:id` | View, edit, or remove an application |
| `POST` | `/api/applications/:id/activities` | Add a timeline activity |

All application routes require `Authorization: Bearer <token>`.
