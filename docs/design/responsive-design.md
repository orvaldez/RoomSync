# Responsive Design Considerations

RoomSync — Software Design and Development
Issue #27 · Milestone 1 deliverable

NFR-05 requires the application to be fully usable at a viewport width of 375
pixels. This records the approach, the decisions behind it, and the evidence:
every MVP screen captured at 375px and at 1280px, measured for horizontal
overflow, with the screenshots committed under [`screenshots/`](screenshots/)
(§5).

---

## 1. Why 375px

375 CSS pixels is the viewport of an iPhone SE and the narrowest width in
common use. A layout that works there works on essentially every phone.

The target matters for RoomSync specifically because of the second persona.
Marcus does not actively manage household information — he checks what he owes
and what he is supposed to do, usually on a phone, usually briefly. If the
dashboard is awkward on a phone, it is awkward for the user the dashboard
exists for.

---

## 2. Approach: fluid first, breakpoints only where needed

The layout is fluid rather than a set of fixed designs at named breakpoints.
Containers use percentage and `max-width` sizing, so they fill a narrow screen
and stop growing on a wide one:

```css
.auth-form {
  width: 100%;
  max-width: 380px;
}

.field input {
  width: 100%;
  box-sizing: border-box;
}
```

`box-sizing: border-box` is doing real work there: without it, `width: 100%`
plus horizontal padding computes wider than the parent, and the input overflows
by exactly its padding — one of the most common causes of unwanted horizontal
scroll.

The existing `:root` rule from the scaffold reduces the base font size below
1024px, which the new styles inherit rather than override.

**Breakpoints used:** two.

| Breakpoint | Rule | Why |
|---|---|---|
| `max-width: 1024px` | Smaller base font and headings | Inherited from the scaffold's type scale; a 56px heading does not fit a phone |
| `min-width: 768px` | Dashboard panels go from one column to two | The only multi-column layout in the app (§3.4) |

Everything else is fluid. Adding breakpoints per screen would mean maintaining
several fixed layouts; the fluid approach adapts to widths nobody tested.

---

## 3. Specific decisions

### 3.1 Inputs are 16px

```css
.field input {
  font-size: 16px; /* below 16px, iOS Safari zooms the page on focus */
}
```

Mobile Safari zooms the viewport when a focused input has a font size under
16px. The zoom is not undone when the field blurs, so the user is left on a
magnified, horizontally scrolling page after tapping a single field. This is a
one-line fix that is invisible until tested on a real device — and it is a
frequent cause of "the form is broken on my phone" reports.

### 3.2 The header wraps rather than compresses

```css
.shell-header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
```

At 375px the brand and the user controls fit on one line, but a longer user
name would overflow. `flex-wrap` lets the controls move to a second line
instead of squeezing the brand or forcing a scrollbar. Wrapping is preferable
to truncation here: the log out button must stay reachable.

### 3.3 Touch targets

Buttons carry `padding: 10px 16px` on top of a 16px line, giving roughly 40px
of height. The WCAG 2.2 target-size minimum (AA) is 24×24 CSS pixels, and
Apple's guidance is 44×44. 40px clears the standard the project is held to and
is close to the more generous one; the full-width form submit button is
comfortably larger than either.

### 3.4 One column by default, two only where there is room

Every screen is a single column except the dashboard, whose panels sit two to
a row at 768px and wider:

```css
.panel-grid {
  display: grid;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .panel-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

The narrow layout is the default and the wide one the exception. The reverse
is what tends to break: a layout designed wide and then squeezed produces
content too narrow to read, rather than simply stacked.

### 3.5 Rows wrap instead of truncating

A row that pairs a sentence with a date or amount — a dashboard activity line,
an expense, a balance with its Record payment button — uses
`display: flex; flex-wrap: wrap; justify-content: space-between`. Where both fit
they share a line; at 375px a long one, such as Orlando Rodriguez Valdez adding
"Paper towels and dish soap", pushes the date onto its own line instead of
cutting the sentence off. Nothing in the interface is truncated with an
ellipsis, because the hidden part is usually the part that matters: a name or
an amount.

### 3.6 Checkboxes and radios: the row is the target

The participant checkboxes and split-method radios on Add expense are 18px
controls, below the 24px WCAG 2.2 minimum on their own. Each sits inside its
`<label>`, and the label row is at least 36px tall and full width, so tapping
anywhere on the row, the name included, toggles it:

```css
.choice {
  display: flex;
  min-height: 36px;
}
```

The measurement in §5 flags these 18px inputs; they are the only small targets,
and this is why they pass.

---

## 4. Accessibility overlaps (NFR-04)

Two decisions serve both accessibility and small screens.

**Focus is restyled, never removed.**

```css
.field input:focus-visible,
button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

`outline: none` with no replacement makes a form unusable by keyboard, and it
is the single most common accessibility regression in hand-written CSS.
`:focus-visible` rather than `:focus` means mouse users do not see a ring they
did not ask for, while keyboard users always do.

**Errors are associated, not merely adjacent.** `components/Field.tsx` wires
each input to its error with `aria-describedby` and marks it `aria-invalid`, so
a screen reader announces the error with the field. Red text placed nearby is
invisible to a screen reader and to anyone who cannot distinguish the colour —
and on a narrow screen, "nearby" may not be nearby at all once things reflow.

---

## 5. Verified: every MVP screen at 375px and 1280px

Each screen was loaded in headless Microsoft Edge (Chromium) at a 375×812
viewport and at 1280×800, signed in as the seed accounts (`npm run db:seed`)
so every panel holds real data rather than an empty state. On each, a script
checked that `document.documentElement.scrollWidth` equals the viewport width
(no horizontal scroll) and that no element's right edge passes the viewport,
then saved a full-page screenshot.

| Screen | Use case | 375px | 1280px | Horizontal overflow |
|---|---|---|---|---|
| Log in | UC-02 | [mobile](screenshots/mobile/01-login.png) | [desktop](screenshots/desktop/01-login.png) | None |
| Create account | UC-01 | [mobile](screenshots/mobile/02-register.png) | [desktop](screenshots/desktop/02-register.png) | None |
| Set up your household | UC-03 | [mobile](screenshots/mobile/03-create-household.png) | [desktop](screenshots/desktop/03-create-household.png) | None |
| Join a household | UC-04 | [mobile](screenshots/mobile/04-join-household.png) | [desktop](screenshots/desktop/04-join-household.png) | None |
| Dashboard, owner with an invitation link open | UC-04, UC-10 | [mobile](screenshots/mobile/05-dashboard-owner-invite.png) | [desktop](screenshots/desktop/05-dashboard-owner-invite.png) | None |
| Dashboard, member | UC-10 | [mobile](screenshots/mobile/06-dashboard.png) | [desktop](screenshots/desktop/06-dashboard.png) | None |
| Add an expense, with the split preview | UC-05, UC-06 | [mobile](screenshots/mobile/07-add-expense.png) | [desktop](screenshots/desktop/07-add-expense.png) | None |
| Chores | UC-09 | [mobile](screenshots/mobile/08-chores.png) | [desktop](screenshots/desktop/08-chores.png) | None |
| Balances, recording a payment | UC-07, UC-08 | [mobile](screenshots/mobile/09-balances-record-payment.png) | [desktop](screenshots/desktop/09-balances-record-payment.png) | None |

Every screen in the MVP is in the table; the expense list is a panel on the
dashboard (rows 5 and 6). The one screen in the wireframes that is not here,
expense detail, is not built (US-11, Sprint 3).

| Check | Result |
|---|---|
| No horizontal scroll at 375px, all nine screens | **Pass** — `scrollWidth` is 375 on every one |
| No horizontal scroll at 1280px, all nine screens | **Pass** |
| Interactive elements at least 24×24px | **Pass** — the only smaller ones are the 18px checkboxes and radios on Add expense, whose 36px label rows are the target (§3.6) |
| Inputs at least 16px, so iOS does not zoom | **Pass** — set on `.field input`, `.field select` and the invitation link (§3.1) |
| Real iOS or Android device | **Not tested** |
| Landscape orientation on a phone | **Not tested** |
| Text scaled to 200% (WCAG 1.4.4) | **Not tested** |

The untested rows are stated rather than glossed. Real-device and zoom testing
are Milestone 2 work (testing and improvement), and this list is the starting
checklist for it.

To re-check after a layout change, run the seed, open each screen in a
browser's device toolbar at 375px signed in as a seed account, and compare
against the screenshots.

---

## 6. How each screen handles 375px

| Screen | Approach at 375px |
|---|---|
| Log in, create account, set up household | One form, `width: 100%` up to 380px; inputs full width |
| Join a household | One sentence and two actions that wrap below each other if needed |
| Dashboard | Panels stack in one column below 768px (§3.4); balances and activity are lists of sentences, not tables |
| Invitation link | The read-only link and its Copy button share a row, and wrap below it rather than overflowing |
| Expense list | Two lines per expense (what and how much, then when, who paid and your share) rather than a five-column table |
| Add expense | Full-width fields; participants are a checkbox list, not a multi-select; the split preview is name and amount per row, amounts right-aligned |
| Chores | A card per chore, with the assignee and due date beneath the title |
| Balances | One row per member, with owed and owing carried by the sentence ("You owe…", "…owes you") rather than colour alone; the payment form opens under its row |

The recurring decision is **lists over tables**. Tabular data at 375px either
scrolls horizontally or truncates; neither is usable. A row or card per record
keeps every field visible and reads naturally in one column.

The other is **never colour alone**. Whether a balance is owed or owing, and
whether a chore is overdue, is carried by words ("You owe", "Overdue by 2
days", with a ⚠ marker) and not only by colour, which serves colour-blind
users and survives the low-contrast conditions of a phone screen outdoors.
