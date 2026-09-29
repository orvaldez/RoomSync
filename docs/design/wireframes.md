# UX Wireframes

RoomSync — Software Design and Development
Issue #5 · Milestone 1 deliverable

Wireframes for the multi-screen interface. Each screen is marked **Built** or
**Proposed**: built screens are drawn as they actually render, so the wireframe
documents the product; proposed screens are designs for stories not yet
implemented.

Drawn at desktop width. Every screen is a single column at 375px — the
responsive rules are in `docs/design/responsive-design.md` and the narrow
variant is shown wherever it differs structurally rather than just reflowing.

---

## 1. Screen map

```
                    ┌──────────────┐
      not signed in │  /login      │◀──── logout, or any 401
                    └──────┬───────┘
                           │ "Create one"
                    ┌──────▼───────┐
                    │  /register   │
                    └──────┬───────┘
                           │ auto-login
                    ┌──────▼───────────────────────────┐
                    │  /  (RequireAuth)                │
                    │                                  │
                    │   GET /households/current        │
                    │        │                         │
                    │   null │        household        │
                    │        ▼             ▼           │
                    │  Create household   Dashboard    │
                    └──────────────────────┬───────────┘
                                           │
                   ┌───────────────┬───────┴────┬──────────────┐
                   ▼               ▼            ▼              ▼
              /expenses       /expenses/new  /chores      /members
              (proposed)      (proposed)     (proposed)   (proposed)
```

The root route decides between the create-household screen and the dashboard by
asking the server, rather than keeping that state on the client. Belonging to no
household is a normal answer (`200 { household: null }`), not an error.

---

## 2. Log in — **Built**

```
┌──────────────────────────────────────────────┐
│                                              │
│                  Log in                      │
│                                              │
│     ┌────────────────────────────────┐       │
│     │ [!] Invalid email or password. │ ◀─ role="alert", only on failure
│     └────────────────────────────────┘       │
│                                              │
│     Email                                    │
│     ┌────────────────────────────────┐       │
│     │                                │       │
│     └────────────────────────────────┘       │
│                                              │
│     Password                                 │
│     ┌────────────────────────────────┐       │
│     │                                │       │
│     └────────────────────────────────┘       │
│                                              │
│     ┌────────────────────────────────┐       │
│     │            Log in              │       │
│     └────────────────────────────────┘       │
│                                              │
│      No account yet? Create one              │
│                                              │
└──────────────────────────────────────────────┘
```

The credentials error sits **above the form**, not under a field. Attaching it
to the password input would tell someone guessing that the email was correct,
which undoes the server-side work that makes unknown-email and wrong-password
indistinguishable.

Form is capped at 380px and centred, so it does not stretch across a wide
monitor.

---

## 3. Create account — **Built**

```
┌──────────────────────────────────────────────┐
│             Create your account              │
│                                              │
│     ┌────────────────────────────────┐       │
│     │ [!] Registration could not be  │ ◀─ 409, deliberately vague
│     │     completed.                 │       │
│     └────────────────────────────────┘       │
│                                              │
│     Name                                     │
│     ┌────────────────────────────────┐       │
│     └────────────────────────────────┘       │
│     Email                                    │
│     ┌────────────────────────────────┐       │
│     └────────────────────────────────┘       │
│       Enter a valid email address.    ◀─ per-field, from the
│     Password                                 │  contract's `fields` map
│     ┌────────────────────────────────┐       │
│     └────────────────────────────────┘       │
│       At least 8 characters.                 │
│                                              │
│     ┌────────────────────────────────┐       │
│     │        Create account          │       │
│     └────────────────────────────────┘       │
│                                              │
│      Already have an account? Log in         │
└──────────────────────────────────────────────┘
```

Two error channels, deliberately: **field errors** under their input for
anything the user can fix by editing that field, and a **form-level message**
for anything else. Every invalid field is shown at once rather than one per
submission.

---

## 4. Set up your household — **Built**

```
┌──────────────────────────────────────────────┐
│  RoomSync                  Orlando  [Log out]│
├──────────────────────────────────────────────┤
│  Set up your household                       │
│                                              │
│  Create a household to start tracking shared │
│  expenses and chores. You can invite your    │
│  roommates once it exists.                   │
│                                              │
│  Household name                              │
│  ┌──────────────────────────────┐            │
│  │ e.g. Apartment 4B            │            │
│  └──────────────────────────────┘            │
│    Household name is required.               │
│                                              │
│  ┌──────────────────────────────┐            │
│  │      Create household        │            │
│  └──────────────────────────────┘            │
└──────────────────────────────────────────────┘
```

Shown automatically when `GET /households/current` returns null. The copy
frames this as one of two ways in, so joining by invitation (US-04) can be added
beside it without rewriting the page.

---

## 5. Dashboard — **Built (shell) / Proposed (content)**

What renders today:

```
┌────────────────────────────────────────────────────────┐
│  RoomSync                          Orlando  [Log out]  │
├────────────────────────────────────────────────────────┤
│  Apartment 4B                                          │
│  Signed in as Orlando · You own this household         │
│                                                        │
│  ┌─────────────────────┐  ┌─────────────────────┐      │
│  │ Your balance        │  │ Your chores         │      │
│  │ Nothing owed either │  │ No chores assigned  │      │
│  │ way yet.            │  │ to you.             │      │
│  └─────────────────────┘  └─────────────────────┘      │
│  ┌─────────────────────┐                               │
│  │ Recent activity     │                               │
│  │ Expenses, settle-   │                               │
│  │ ments and chores    │                               │
│  │ will show here.     │                               │
│  └─────────────────────┘                               │
└────────────────────────────────────────────────────────┘
```

Panels are labelled empty states rather than hidden. Hiding them would make the
dashboard look finished; labelling them shows the shape of UC-10.

Proposed, once the endpoints exist:

```
┌────────────────────────────────────────────────────────┐
│  RoomSync      Expenses  Chores  Members   O.  [Log out]│ ◀─ nav appears
├────────────────────────────────────────────────────────┤   when there is
│  Apartment 4B                                          │   somewhere to go
│                                                        │
│  ┌──────────────────────────┐ ┌──────────────────────┐ │
│  │ Your balance             │ │ Your chores          │ │
│  │                          │ │                      │ │
│  │  Maya owes you   $24.50  │ │ ☐ Take out bins      │ │
│  │  You owe Sam     $12.00  │ │   Due today          │ │
│  │  ─────────────────────   │ │ ☐ Clean kitchen      │ │
│  │  Net             +$12.50 │ │   Due Fri            │ │
│  │                          │ │                      │ │
│  │  [ Record a payment ]    │ │ [ View all chores ]  │ │
│  └──────────────────────────┘ └──────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐│
│  │ Recent activity                                    ││
│  │  Sam added "Groceries" $60.00        2 hours ago   ││
│  │  You paid Maya $15.00                Yesterday     ││
│  │  Maya completed "Vacuum"             Monday        ││
│  └────────────────────────────────────────────────────┘│
│                            [ + Add expense ]           │
└────────────────────────────────────────────────────────┘
```

**Balances are shown per person, not as one number.** "You are owed $12.50"
hides the fact that you owe Sam. Roommates settle pairwise, so the pairwise
figures are what they act on; the net is a summary beneath, not a replacement.

**Direction is carried by words and sign, never colour alone** — "owes you"
versus "you owe" plus a signed net. Colour is decoration on top.

---

## 6. Add expense — **Proposed** (US-05, US-06)

The most complex screen in the MVP, and the one where the splitting rules
become visible.

```
┌────────────────────────────────────────────────────────┐
│  Add an expense                                        │
│                                                        │
│  Description                                           │
│  ┌──────────────────────────────────────┐              │
│  │ Groceries                            │              │
│  └──────────────────────────────────────┘              │
│                                                        │
│  Amount              Date                              │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │ $ 60.00      │    │ 2026-09-29   │                  │
│  └──────────────┘    └──────────────┘                  │
│                                                        │
│  Paid by                                               │
│  ┌──────────────────────────────────────┐              │
│  │ Orlando (you)                     ▾  │              │
│  └──────────────────────────────────────┘              │
│                                                        │
│  Split between                                         │
│  ☑ Orlando    ☑ Maya    ☑ Sam                          │
│                                                        │
│  How to split                                          │
│  ( ) Equally   ( ) By amount   ( ) By percentage       │
│                                                        │
│  ┌──────────────────────────────────────┐              │
│  │ Orlando              $20.00          │              │
│  │ Maya                 $20.00          │ ◀─ live preview,
│  │ Sam                  $20.00          │    recomputed on
│  │ ──────────────────────────────       │    every change
│  │ Total                $60.00  ✓       │              │
│  └──────────────────────────────────────┘              │
│                                                        │
│            [ Cancel ]   [ Save expense ]               │
└────────────────────────────────────────────────────────┘
```

**The live preview is the important part of this screen.** SC-04 requires shares
to sum exactly to the total, and the rounding that makes it exact is not
obvious: $100 across three is 33.34 / 33.33 / 33.33, not three equal thirds.
Showing the computed shares and the total with a tick means the user sees the
arithmetic before committing, and the "off by one cent" question never arises
after the fact.

The total line shows ✓ when shares match and the difference when they do not,
which matters for the custom-amount mode where the user can enter figures that
do not add up. The save button is disabled until they do.

**Amounts are entered in dollars and converted to integer cents before
sending** (FR-18). The client never sends a float.

At 375px the split preview becomes one row per person, full width, with the
amount right-aligned — never a table.

---

## 7. Expenses list — **Proposed** (US-11)

```
┌────────────────────────────────────────────────────────┐
│  Expenses                          [ + Add expense ]   │
│                                                        │
│  ┌────────────────────────────────────────────────────┐│
│  │ Groceries                              $60.00      ││
│  │ Paid by Sam · Sep 29 · split 3 ways                ││
│  │ You owe $20.00                                     ││
│  └────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────┐│
│  │ Electricity                            $84.00      ││
│  │ Paid by you · Sep 27 · split 3 ways                ││
│  │ You are owed $56.00                                ││
│  └────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

**A card per expense, not a table.** Five columns cannot be read at 375px
without horizontal scrolling, and a card keeps every field visible in one
column. This is the recurring pattern for every list in the app.

Each card leads with what the reader wants — the description and total — then
context, then the line that actually matters to them personally.

---

## 8. Chores — **Proposed** (US-09)

```
┌────────────────────────────────────────────────────────┐
│  Chores                              [ + Add chore ]   │
│                                                        │
│  Outstanding                                           │
│  ┌────────────────────────────────────────────────────┐│
│  │ ☐  Take out bins                                   ││
│  │    Orlando · Due today                             ││
│  └────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────┐│
│  │ ☐  Clean kitchen                                   ││
│  │    Maya · Overdue by 2 days            [!]         ││
│  └────────────────────────────────────────────────────┘│
│                                                        │
│  Completed                                             │
│  ┌────────────────────────────────────────────────────┐│
│  │ ☑  Vacuum living room                              ││
│  │    Maya · Completed Monday                         ││
│  └────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

Outstanding and completed are separate sections rather than one list with
styling differences, because "what still needs doing" is the question the screen
exists to answer.

Overdue is marked with both text and an icon, not colour alone.

The checkbox is only interactive on chores assigned to the viewer — FR-15 scopes
completion to the assignee. On someone else's chore it renders as a static
indicator, and the server enforces this regardless
(`403 CHORE_NOT_ASSIGNED_TO_YOU`).

---

## 9. Members and invite — **Proposed** (US-04)

```
┌────────────────────────────────────────────────────────┐
│  Apartment 4B                                          │
│                                                        │
│  Members                                               │
│  ┌────────────────────────────────────────────────────┐│
│  │ Orlando        Owner        Joined Sep 29          ││
│  │ Maya           Member       Joined Sep 30          ││
│  └────────────────────────────────────────────────────┘│
│                                                        │
│  ┌──────────────────────────────┐                      │
│  │      Invite a roommate       │ ◀─ owner only        │
│  └──────────────────────────────┘                      │
│                                                        │
│  ── after clicking ────────────────────────────────    │
│                                                        │
│  Send this link to your roommate. It expires in        │
│  7 days.                                               │
│  ┌──────────────────────────────────────┐  ┌────────┐  │
│  │ https://roomsync.app/join/a7f3...    │  │  Copy  │  │
│  └──────────────────────────────────────┘  └────────┘  │
└────────────────────────────────────────────────────────┘
```

**Members are listed by name, not email.** NFR-06 says personal account
information is not exposed further than needed, and roommates identify each
other by name — which is why the contract's `MemberPublic` omits email.

The invite button is owner-only in the UI, and the server checks it too
(`403 NOT_HOUSEHOLD_OWNER`). Hiding a control is presentation; the check is
the access control.

RoomSync does not send email in the MVP, so the link is displayed for the owner
to send themselves. The 7-day expiry is stated on screen rather than left for
the recipient to discover when it fails.

---

## 10. Patterns across screens

| Pattern | Rule |
|---|---|
| Field errors | Under the field, tied by `aria-describedby`, all shown at once |
| Form errors | Above the form, `role="alert"` |
| Lists | A card per record, never a table |
| Empty states | Labelled with what will appear, never hidden |
| Money | Dollars in the UI, integer cents on the wire |
| Status | Words and shape first; colour is decoration |
| Destructive actions | None in the MVP — nothing is editable or deletable |
| Loading | Explicit state with `aria-busy`, never a blank screen |

---

## 11. What these wireframes do not cover

- **Visual design.** These are structure and behaviour. Colour, type and spacing
  come from the tokens in `client/src/index.css`.
- **Error screens** beyond form errors — a generic failure state exists on the
  dashboard but is not drawn.
- **US-11 history views** beyond the expense list, since that story is P1 and
  scheduled for Sprint 3.
- **Anything about editing or deleting** an expense, which the MVP does not
  support.