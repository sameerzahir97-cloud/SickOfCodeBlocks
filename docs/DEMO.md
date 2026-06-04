# socb — demo script & Q&A cheat sheet

Everything you need to present this confidently in ~5 minutes. You don't type a single
command live — you click buttons in the playground. Read this once, keep it open in a tab.

**Playground:** https://sameerzahir97-cloud.github.io/SickOfCodeBlocks/
**Offline backup:** open `docs/index.html` from the repo in any browser (works with no internet).

---

## The 30-second opener

> "Quick show of hands — who's pasted a deploy log or an error into Teams and it came out as
> unreadable garbage? Colors, progress bars, broken tables. *(pause for hands)* That's what I built
> a tool to fix. You paste the mess in, you get clean text out, ready for Teams, a ticket, or email."

---

## Live flow (4 minutes — all clicking, no typing)

The page opens already loaded with a **Salesforce deploy error** and the **Teams** format selected.

1. **Point at the left pane.** "This is real `sf project deploy` output — a spinner, a progress bar,
   a status table, an Apex error. If you paste this straight into Teams, it's a mess."
2. **Point at the right pane.** "Same thing, cleaned. The progress bar collapsed to its final state,
   the colors are gone, the error's still there. I'd paste *this* into Teams."
3. **Click the example dropdown → "Apex test results."** "A box-drawing table — looks fine in the
   terminal, falls apart anywhere else. Watch—" *(it rebuilds into clean aligned columns.)*
4. **Click "AI assistant answer (Markdown)," then click the "Email" button.** "When you paste a
   ChatGPT or Claude answer into an email, you get all the `##` and `**` symbols. socb flattens it to
   plain prose — but notice the code block stays exactly as-is. That's the hard part, and it's
   deliberate."
5. **Tick "Redact secrets."** "It can also mask API keys, tokens, emails before you share."
6. **Click "Copy clean output," switch to a Teams chat, paste.** "And that's the whole point — clean,
   in seconds, no screenshot."
7. **(Optional, for the engineers)** "Under the hood it's also a command-line tool —
   `sf project deploy start | socb --teams` — and it ships as an MCP server, so an AI agent can call
   it to clean output automatically."

**Close:** "It's on npm, MIT-licensed, with automated tests running on Windows, Mac, and Linux. The
playground link works for anyone, right now."

---

## Talking points (what makes it more than "strip colors")

Anyone can delete ANSI color codes with a regex. socb does the parts that are actually hard:

- **Collapses progress bars / spinners** to their final line (it replays the carriage-return redraws).
- **Rebuilds box-drawing tables** into clean aligned columns.
- **Flattens Markdown & HTML to prose** — headings, bold, links → `text (url)` — while keeping fenced
  **code blocks exactly intact**.
- **Redacts** secrets/PII (best-effort).
- **Presets** for where you're pasting: Teams · Slack · Email · Plain · Agent.
- One engine, three forms: a **CLI**, a **library**, and an **MCP server** for AI agents.

---

## Likely questions — honest answers

**"How's this different from strip-ansi / sed / a regex?"**
> Those only delete color codes. socb *understands* the output — it collapses progress-bar redraws,
> rebuilds tables, flattens Markdown, and redacts secrets. *(Then: "here, let me paste a table in.")*

**"Did you build this with AI?"** *(answer it head-on, it's a strength)*
> Yes — I used AI tooling, the same way the team uses Copilot. I decided what to build, designed how
> it behaves, wrote the tests, and shipped it to npm with CI on three operating systems. The
> engineering is in the judgment and the shipping, not in typing every character. This is how modern
> tools get built.

**"Is it safe to paste logs/secrets into a website?"**
> It runs 100% in your browser — nothing you paste is uploaded or leaves your machine; it even works
> with the network off. The redact toggle is a second layer on top of that.

**"Is the redaction actually secure?"**
> It's best-effort, not a guarantee — always glance at the output before you share. It catches the
> common things: API keys, tokens, JWTs, emails, IPs, home-dir paths.

**"Why not just take a screenshot?"**
> Screenshots can't be searched or copied, break for screen readers, and clog up threads. Clean text
> is better in a ticket or Teams — and reviewers can quote it.

**"Does it handle OUR sfdx/sf output / this weird log?"** *(your strongest moment)*
> Let's find out — paste one in. *(Paste their example into the playground. It just works.)*

**"What's it cost? Dependencies?"**
> Free and MIT-licensed. The core CLI has zero runtime dependencies.

**"Can it run in CI / our pipeline?"**
> Yes — it's a CLI and a library, so you can pipe any command's output through it in a script.

---

## If you freeze or get a curveball

- Blank on what to say? **"Let me just show you"** — load an example and let the tool talk.
- Asked something you don't know? **"Great question — I'm not 100% sure, let me check and follow
  up."** That's a senior, credible answer, not a weakness. Nobody knows everything.
- Demo glitch? You have the **offline copy** (`docs/index.html`) and screenshots in your slides.

You shipped a real, published, tested, cross-platform tool. You belong in that room.
