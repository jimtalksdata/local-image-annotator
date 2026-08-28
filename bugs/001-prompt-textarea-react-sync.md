# BUG 001 — Saved profile can capture a prompt that differs from what the textarea shows

**Filed** 2026-08-23 · **Status** open, deferred · **Severity** medium (silent data mismatch)
**Area** `components/ProfilePanel` (instruction prompt textarea) + `backend/profiles.py` save path

## What happened

While driving the UI from Chrome DevTools to create a `werewolf-girls · Qwen3.5-9B (v2 lean)`
profile:

1. Selected model `Qwen3.5-9B`, set the instruction prompt to a new 606-character prompt, ticked
   **Greedy decoding**.
2. The textarea visibly contained the new prompt — confirmed in the accessibility snapshot, which
   reads the live DOM `value`.
3. Clicked **Save as new**.
4. `state/profiles.json` came back holding the **default 6-category prompt**, not the one on screen.
   Every other field (model id, greedy, maxNewTokens) saved correctly.

Re-setting the value through the React-aware path and clicking **Save** persisted the correct
prompt, so the profile is now right and the run was unblocked.

## Cause

The textarea is a React controlled component. Assigning `element.value = "..."` mutates the DOM node
but does not run React's synthetic `onChange`, so component state keeps the previous prompt. The DOM
and React then disagree: the DOM shows the new text, React holds the old text, and **the save path
serialises React state**. That is why the a11y snapshot looked correct while the saved file was not.

The working sequence was the standard native-setter workaround:

```js
const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
setter.call(textarea, newPrompt);
textarea.dispatchEvent(new Event('input', { bubbles: true }));
```

## Is this actually an app defect?

Partly, and it is worth being precise about which part.

- **Not a defect:** a human typing in the box is fine. React's behaviour here is correct and
  expected; automated `.value` assignment bypassing `onChange` is a known property of controlled
  components, not a bug in this app.
- **Is a defect:** the app can persist a prompt that is not the prompt the user is looking at, with
  no warning. Whatever puts the DOM out of sync — automation, an extension, a password manager, a
  browser autofill, a future paste handler — the failure is silent and produces a profile that
  captions the whole dataset with the wrong instructions. The user only finds out by diffing
  `profiles.json`.

So: fix the second point, ignore the first.

## Suggested fix

Cheapest defensive option — on save, prefer the DOM value if it disagrees with state:

- read the textarea's live `value` in the save handler rather than trusting state alone, or
- add an `onBlur` handler that re-syncs component state from the DOM before any save can fire.

Belt-and-braces: after a successful save, compare the returned profile's `prompt` against the
textarea and surface a warning toast on mismatch, so a silent divergence becomes visible.

## Repro

1. Open the profile panel, note the prompt.
2. In DevTools console: `document.querySelector('textarea').value = 'XXX'`
3. Click **Save as new**, give it any name.
4. Inspect `state/profiles.json` — the saved prompt is the old one, not `XXX`.

## Notes

- Only the two `<textarea>` fields are implicated (instruction prompt, system prompt override).
  `<select>` and checkbox controls synced correctly through the same automation path.
- Not blocking: the profile now on disk is correct and the full-dataset run proceeded with it.
