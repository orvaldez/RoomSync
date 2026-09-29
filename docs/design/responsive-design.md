# Responsive Design Considerations

RoomSync — Software Design and Development
Issue #27 · Milestone 1 deliverable

NFR-05 requires the application to be fully usable at a viewport width of 375
pixels. This records the approach, the decisions behind it, and what is
verified today versus what is still to build.

The screens that exist — login, registration, and the dashboard shell — were
rendered at 375px in a headless browser during development and produce no
horizontal scrolling. Screens that do not exist yet are covered as intentions,
labelled as such.

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

**Breakpoints used:** one, at 1024px, inherited from the scaffold's type scale.
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

### 3.4 Single-column everywhere

No multi-column layout exists, so there is no reflow to get wrong. When the
dashboard gains real panels they will stack vertically by default and may sit
side by side above a breakpoint — the reverse is what tends to break, because a
layout designed wide and then squeezed produces content that is too narrow to
read rather than simply stacked.

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

## 5. Verified so far

| Check | Status |
|---|---|
| Login renders at 375px with no horizontal scroll | Verified — `document.scrollWidth === 375` in a headless browser |
| Login renders at desktop width | Verified |
| Registration, dashboard | Same components and styles; not separately measured |
| Real iOS or Android device | **Not tested** |
| Landscape orientation on a phone | **Not tested** |
| Text scaled to 200% (WCAG 1.4.4) | **Not tested** |

The gaps are stated rather than glossed. Cross-viewport testing evidence is a
Milestone 2 deliverable, and this list is the starting checklist for it.

---

## 6. Planned, for screens not yet built

| Screen | Approach at 375px |
|---|---|
| Household dashboard | Panels stack in one column; balances as a list, not a table |
| Expense list | Card per expense rather than a table — a table with five columns cannot be read at 375px without horizontal scroll |
| Add expense | Full-width fields; the participant picker is a checkbox list, not a multi-select |
| Split preview | Name and amount per row, right-aligned amounts |
| Balances | One row per member, with owed and owing distinguished by label and sign rather than colour alone |
| Chores | Card per chore with the due date beneath the title |

The recurring decision is **cards over tables**. Tabular data at 375px either
scrolls horizontally or truncates; neither is usable. A card per record keeps
every field visible and reads naturally in one column.

The other is **never colour alone**. Whether a balance is owed or owing is
carried by a label and a sign, not only by red and green, which serves
colour-blind users and survives the low-contrast conditions of a phone screen
outdoors.
