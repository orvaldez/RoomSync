# One household per user, under concurrent requests (#73)

Threat model **H3**, OWASP A06. Recorded November 2, 2026.

## The problem

RoomSync allows one household per user in the MVP (UC-03 1a, UC-04 9a). The
rule was a check followed by a write: `createHousehold` and `acceptInvitation`
asked "does this user already belong to a household?", then a transaction
added the membership. Two requests for the same user arriving together could
both get "no" before either wrote. That could happen with a double-clicked
*Create household* button, two invitation links opened at once, or a creation
racing an acceptance. Either way the user ended up in two households. Only the
user's own account was affected, but it broke an invariant the rest of the
app assumes (analysis model §7).

## The fix

Every write that adds a membership now takes a **per-user advisory lock**
inside its transaction and checks again under it:

- `lockMemberships(tx, userId)` in `server/src/repositories/household.repository.ts`
  runs `pg_advisory_xact_lock(42, hashtext(userId))`. It uses the same pattern
  as the ledger lock, which uses namespace 41.
- `createWithOwner` takes it, counts the user's memberships, and returns null
  rather than creating anything if there is one.
- `acceptIntoHousehold` takes it before claiming the invitation and returns
  `"ALREADY_IN_HOUSEHOLD"` if the user is already elsewhere. That invitation
  is left `PENDING`, so the owner can give it to someone else.
- The services turn both into `409 ALREADY_IN_HOUSEHOLD`, the same answer as
  the existing up-front check.

Requests for one user now run one at a time, other users never wait, and the
lock is released at commit or rollback. A unique index on
`Membership.userId` was the other option. It would have needed a migration
now and another one to undo it for the post-MVP multi-household feature, so
the lock was chosen (analysis model §7).

## The test

`server/src/integration/one-household.integration.test.ts` runs against real
PostgreSQL with no mocks. It fires two requests for the same user at once, in
three combinations, five rounds each with fresh users:

1. two household creations
2. two invitations, from two different households, accepted together
3. a household creation and an acceptance together

Each round requires exactly one request to succeed and the other to get
`409 ALREADY_IN_HOUSEHOLD`, and the database to hold exactly one membership
for the user. In case 2, the losing invitation must still be `PENDING`.

## Before: `main` at `60da9e8`, without the fix

The same test file, run with the four source files from `main`. In every case
both requests succeeded on the first round, so the user joined two
households:

```
 ❯ src/integration/one-household.integration.test.ts (3 tests | 3 failed) 1994ms
   × one household per user, under concurrent requests (#73) > lets only one of two simultaneous household creations through 730ms
     → expected [ 'success', 'success' ] to deeply equal [ '409 ALREADY_IN_HOUSEHOLD', …(1) ]
   × one household per user, under concurrent requests (#73) > lets only one of two invitations accepted at the same moment through 743ms
     → expected [ 'success', 'success' ] to deeply equal [ '409 ALREADY_IN_HOUSEHOLD', …(1) ]
   × one household per user, under concurrent requests (#73) > lets only one of a creation and an acceptance at the same moment through 518ms
     → expected [ 'success', 'success' ] to deeply equal [ '409 ALREADY_IN_HOUSEHOLD', …(1) ]

 Test Files  1 failed (1)
      Tests  3 failed (3)
```

## After: with the fix

```
 ✓ src/integration/one-household.integration.test.ts (3 tests) 7797ms
   ✓ one household per user, under concurrent requests (#73) > lets only one of two simultaneous household creations through 1380ms
   ✓ one household per user, under concurrent requests (#73) > lets only one of two invitations accepted at the same moment through 3399ms
   ✓ one household per user, under concurrent requests (#73) > lets only one of a creation and an acceptance at the same moment through 3014ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

Each round now has exactly one winner, the other request gets 409, and the
user has one membership.

To reproduce, run `cd server && npm run test:integration -- one-household` with
the database running (`docker compose up -d`).
