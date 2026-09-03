# RoomSync

RoomSync is a web-based household management application that helps roommates
coordinate shared expenses, chores, and household membership in one place.
Unlike trip-based expense splitters, RoomSync is built around a **standing
household**: balances persist and carry forward across the length of a lease
instead of resetting, and expenses and chores are managed in the same shared
space.

This repository contains the source code, documentation, and project
artifacts for RoomSync, developed as part of a Software Design and
Development course project.

## Status

This repository is at **Milestone 0 (Propose)**. No application code has
been written yet. This milestone establishes the project proposal,
architecture, backlog, and repository structure that later milestones will
build on.

| Milestone | Goal | Status |
|---|---|---|
| Milestone 0 | Propose | In progress |
| Milestone 1 | Build the MVP | Not started |
| Milestone 2 | Test, improve, and secure | Not started |
| Milestone 3 | Deploy | Not started |

## Team

| Name | Email | Role |
|---|---|---|
| Orlando Rodriguez Valdez | orodriguezval@crimson.ua.edu | Accounts, auth/session, balances, settlements |
| Agustin Lemuz-Juarez | alemuzjuarez@crimson.ua.edu | Households, invitations, expense entry/split logic |

## Planned tech stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | Session-based auth, bcrypt password hashing |
| Containerization | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Testing | Vitest or Jest + Supertest |
| Deployment | Render |

See the [project proposal](./docs/proposal.pdf) for full justification of
these choices.

## Repository structure (planned)

```
roomsync/
├── client/          # React frontend
├── server/          # Node/Express API
├── prisma/          # Database schema and migrations
├── docs/            # Proposal, diagrams, design artifacts
├── .github/         # GitHub Actions workflows
└── docker-compose.yml
```

This structure will be populated starting at Milestone 1.

## Getting started

Setup and run instructions will be added at Milestone 1, once the
application is runnable end to end. At that point this section will include:

- Prerequisites (Node version, Docker)
- Environment variable setup (`.env.example`)
- Database migration and seed instructions
- How to run the client and server locally
- Demonstration account credentials

## Documentation

- [Project proposal](./docs/proposal.pdf)
- [Prioritized backlog](./BACKLOG.md)
- Architecture diagram — see proposal, Figure 2
- Entity relationship diagram — see proposal, Figure 3

## Contributing

All work happens on feature branches off `main` and is merged through
pull requests requiring review from the other team member. See the
proposal's Agile Development Process section for branching conventions,
commit message format, and the Definition of Done.

## License

Course project — not currently licensed for outside use.
