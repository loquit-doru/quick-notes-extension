# My paywall was eating people's notes

I make a browser extension for taking notes. Nothing dramatic: you hit
Ctrl+Shift+Q, a popup opens, you type, it saves.

Last week I went looking for reasons the conversion rate was bad. I found
something worse.

## The free tier

There's a free plan and a one-time Pro unlock. The free plan caps you at a few
notes, and — this was the part I'd stopped thinking about — 500 characters per
note.

Here is where that cap lived:

```js
async function saveCurrentNote() {
  // ...gather title and content from the editor...

  const limits = getCurrentLimits();
  if (limits.maxCharsPerNote !== Infinity && elements.noteContentEditor) {
    const charCount = (elements.noteContentEditor.textContent || '').length;
    if (charCount > limits.maxCharsPerNote) {
      showLimitWarning(`${limits.maxCharsPerNote} character limit reached`);
      return;
    }
  }

  await db.updateNote(noteToSave.id, { title, content });
}
```

`saveCurrentNote` is the autosave. It runs on a timer while you type.

So on a free plan, once you passed 500 characters, autosave stopped writing.
Not "stopped writing the extra characters" — stopped writing. The `return` is
above `db.updateNote`. Title, body, everything.

You'd get a toast saying you'd hit a limit, an upgrade dialog would open on top
of what you were writing, and then when you closed the popup, everything since
your last save under the limit was gone.

I wrote that. It's been live for months.

## It gets worse than that

The extension gives everyone 7 days of full access when they install it. During
those 7 days there's no character cap, so people write real notes — long ones.

Then the trial ends, and the cap comes back.

Now every one of those long notes is permanently uneditable. Open one, fix a
typo, autosave fires, character count is over 500, `return`. The note can never
be saved again. You can read it. You can't touch it.

I'd essentially built a mechanism that punished exactly the people who had used
the product enough to consider paying for it.

## The part that actually stings

I have an end-to-end test suite. 25 tests, all green, popup flows and note
creation and reminders and folders. It never caught this.

Here's the fixture every one of those tests used:

```js
await seedChromeStorage(page, {
  hasLaunched: true,
  proUnlocked: true,        // <-- this
  trialStartDate: Date.now()
});
```

`proUnlocked: true`. Every test ran as a paying customer.

Twenty-five passing tests, and not one of them had ever been a free user. The
entire free branch of the product — the one most people actually experience —
had zero coverage. I'd only ever tested the version that paying customers see.

When I finally wrote a test that expired the trial first, it failed immediately.
Not on my bug, though. It timed out waiting for the folder tabs to appear.

Folders are a Pro feature. On the free plan they're hidden. My test helper's
"wait until the popup is ready" function waited for an element that, by design,
does not exist for free users. The helper had the same blind spot as the tests.

## Two smaller things I found in the same corner

The store listing promised "up to 10 notes" on the free plan. The code gave 5.
I have no idea when they drifted apart. Somebody installs it, reads the listing,
hits the wall at half the number they were told, and leaves. That's not a bug in
any code path — every function did what it said — but the product lied to people
in the one moment where it asks them for money.

And the trial itself ran on wall-clock time from the moment you first opened the
popup. Install it, glance at it, get distracted, come back two weeks later:
trial's gone. You never saw a single Pro feature, and now you're being asked to
pay for things you've never used. I changed it to count only the days the popup
is actually opened. Put it down for a month, the trial waits for you.

## What I changed

The character cap is gone. Not "raised" — gone. A note-taking app that refuses
to save what you typed isn't a limited product, it's a broken one. If I need
free-tier pressure, the note count already does that job, and it does it without
destroying anything.

The free note count is 10 now, matching what the listing had been claiming all
along.

The free plan has tests. Two of them, and they're the first tests in the project
that ever ran as a non-paying user. Before I trusted them I put the old code
back and watched them both fail — a test that passes against a broken build
isn't a test, it's decoration.

## The thing I keep thinking about

None of this showed up as an error. Nothing threw. No console warning, no
crash report, no support email. `return` is a perfectly valid statement.

The users who lost work didn't file a bug. They just stopped opening it, and
uninstalls look identical to ordinary churn from the outside.

I found it by reading the paywall code looking for conversion problems. If I'd
been chasing a crash, or reading my analytics, or waiting for someone to
complain, it would still be there.

Go and read your own paywall. Not the happy path — the branch that runs after
someone decides not to pay you.
