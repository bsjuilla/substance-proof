# Substance Proof

![Substance Proof: the minutes say the board met in Jersey. Did it?](docs/og.jpg)

**The minutes say the board met in Jersey. Did it?**

Substance Proof checks whether a board meeting really met a jurisdiction's *physical-presence* rule, using the evidence in the meeting pack (minutes, boarding passes, e-tickets, hotel bills and the meeting recording) instead of what the minutes merely claim. Meta's Muse models read the evidence; tested code applies the published rule; every finding cites the page or the second it came from.

> Information and calculation from published rules. **Not legal or tax advice.** All demo data is synthetic: every person, company and document is fictional and stamped SPECIMEN.

Built for the **Meta Global AI Developer Hackathon** (Indie track, theme: *Build for Your World*).

**Live demo (recorded real runs, no key needed):** https://bsjuilla.github.io/substance-proof/

---

## Why this matters

Economic-substance and tax-residence rules decide where a company is managed and controlled, and they hinge on where directors physically are when the board decides.

- **Jersey.** The Taxation (Companies – Economic Substance) (Jersey) Law 2019, **Art. 5(3)**, says the company is directed and managed in Jersey *if* the board meets in Jersey at an adequate frequency, **a quorum of directors is physically present in Jersey** at those meetings, the minutes record the strategic decisions, and the minutes and records are kept in Jersey. Being directed and managed in Jersey is one part of the economic substance test (Art. 5(2)). A company that fails the test can be fined up to **£10,000**, and up to **£100,000** for a following period (**Art. 9(2), 9(4)**). Substance Proof checks the board-meeting conditions one meeting at a time; it does not decide the whole test for a year.
- **Singapore.** IRAS treats a board meeting held with video technology as making strategic decisions in Singapore if **at least 50% of the directors with authority to make strategic decisions**, or the **chairman**, are physically in Singapore during the meeting.

Today a company secretary checks this by hand, comparing the minutes with travel and hotel documents. Minutes record what was *claimed*. Nothing checks the claim against the evidence. That gap is the problem: a minutes line saying "present in St Helier" next to a Dubai boarding pass.

I am an accounting and finance student interning at a trust and corporate-services firm, where this kind of record-keeping is everyday work.

**Verdicts.** Each meeting gets one of three: **PASS** (every condition evidenced), **REVIEW** (something is unproven or contradicted, so a person must look), or **NOT MET** (the evidence shows a condition in the law is not met *for this meeting*). One meeting cannot fail the law on its own; the substance test is judged for the whole year.

## What it does (three steps)

1. **Read.** Drop in the meeting pack. Muse Spark reads every document and image, and Muse Voice Transcribe turns the recording into a roll-call. Each fact (who, where, when) comes back with the exact words it was read from.
2. **Decide.** A deterministic, unit-tested rules engine (not the AI) works out where each director was during the meeting and applies the jurisdiction's test. It flags contradictions between the minutes, the recording and the evidence.
3. **Act.** An evidence agent (Muse Spark with tools) drafts requests for missing evidence and corrections to inaccurate minutes. Every tool call is checked by code. **Nothing is sent**: each draft waits for a person to approve or decline it.

![Report for the demo meeting: NOT MET, quorum not evidenced in Jersey](docs/screenshot-report.png)

## How Meta's models are used

| Model | Job | What breaks without it |
|---|---|---|
| **Muse Spark 1.3** (vision + PDF, strict JSON-schema output) | Reads minutes, boarding passes, e-tickets, phone photos, scanned pages and hotel bills; returns each fact with a verbatim quote | Nothing gets read: no facts, no timeline |
| **SAM 3.1** (text-prompted segmentation) | **Privacy before reading.** On every photo or scan, finds the QR code or barcode (which encodes the passenger's name and booking), faces and signatures; code blacks them out and only that copy is sent to Muse Spark. The viewer shows what was masked. | Personal data the check doesn't need goes to the reader |
| **Muse Voice Transcribe** (diarization, keyword hints) | Turns the meeting recording into turns with timestamps. Recordings of any length and format (WAV, MP3, M4A, MP4…) are converted and split into pieces under the 10-minute limit, then stitched onto one timeline | The recording can't be used as evidence; minutes-versus-recording conflicts are invisible |
| **Muse Spark 1.3** (transcript reasoning) | Finds who said where they were joining from, with the turn it was said in | Spoken claims can't be cited to the second |
| **Muse Spark 1.3** (function tools, approval-gated agent) | `list_gaps`, `get_rule_result`, `draft_evidence_request`, `draft_minutes_correction`. Stateless: it sends its own history each step and nothing is stored at Meta, so it also runs on a Zero Data Retention account | No follow-up: gaps stay gaps |
| **Muse Spark 1.3** (long context, strict schema) | **Writes the rules from the law.** Reads a full statute or official guidance (about 10,000 tokens of source) and drafts a rule pack: each rule as data, with the exact words of the law behind it | Every new jurisdiction needs a developer to hand-code it |

### Add a jurisdiction by giving it the law

Muse Spark reads the whole official text and proposes rules, choosing only from test types the engine can compute (quorum present, share of directors present or the chair, minutes record strategic decisions, records kept, and so on). Code then checks each proposal: **its quote must appear word for word in the source**, and its parameters must be valid. Requirements the engine can't compute (for example "adequate frequency" with no number, staff or expenditure) must be listed as *not checkable* rather than dropped silently. A person approves the pack in the app before it is used.

Measured on the official texts (Jersey statute from jerseylaw.je; IRAS company-residency guidance):
- Every proposed rule's quote was found word for word in the source, and code refuses a quote that stops in the middle of a clause (so "meets in Jersey" cannot drop "at an adequate frequency…").
- Muse Spark wrote the Jersey pack (quorum, meetings in Jersey, minutes, records; Art. 5(3)(a)–(e)) and the Singapore pack (at least 50% of directors with strategic authority, or the chairman, for virtual or hybrid meetings) from the raw text alone.
- **Decided with the AI-written packs, all 41 dev and held-out meetings got the same law-level verdict as the hand-written rules, in 3 out of 3 independent runs** ([`eval/results/rulepack-agreement.json`](eval/results/rulepack-agreement.json)).
- Honest note: before I tightened the prompt, one run turned IRAS's descriptive sentence "*Usually, the location of the company's Board of Directors meetings … determines …*" into a hard rule, which changed 2 of 41 verdicts. The prompt now tells the model to encode only stated conditions, and the human approval step exists for exactly this kind of mistake.

`npx tsx scripts/build-packs.ts` reproduces this (about $0.18 for 3 runs). In live mode, *Rules written from the law* lets you paste any substance law and see the proposed rules with their quotes; *Decide with the rules Muse Spark wrote* runs a meeting with the AI-written pack instead of the hand-written rules.

The model **never decides** a legal test. The line between AI and code is deliberate:

- **AI:** finds, reads and quotes; drafts messages.
- **Code:** time zones (labels like `GST`, `GMT+8`, `UTC+04:00`, IANA names, or "local time" resolved from the venue), name matching (including airline style `CASTELL/BRUNO` and speech-recognition spelling slips, accepted only when one director is clearly closest), physical sanity checks (a flight must land after it leaves), presence inference, the rule tests, contradiction detection, and the guardrails on every agent tool call.

## Results

Every number below comes from a script in this repo (`npm run eval`); the scoreboards are in [`eval/results/`](eval/results/).

**Where the answer key comes from.** The synthetic generator knows what really happened in each meeting (who stayed where, who flew when), so the truth is exact. The expected verdict for each meeting is computed by an **independent oracle** ([`scripts/oracle.ts`](scripts/oracle.ts)): a second, deliberately simple implementation of the rules that shares no code with the engine. When the documents are generated, the engine is also run on the *true* facts, and every disagreement with the oracle is reported; there are none on all 53 meetings. The scores below therefore measure the whole system (reading, matching, time zones, rules) against a key the engine did not write.

| Set | What it is | Facts read exactly | Directors placed correctly | Meeting verdicts | Contradictions caught | Dangerous errors* |
|---|---|---|---|---|---|---|
| **Held-out test** | 30 randomised meetings, 110 files: e-tickets, tilted phone photos, scanned image-only minutes, prose minutes, letter-style hotel bills, airline-style names. Never used for tuning. | **165 / 166** | **85 / 86** | **30 / 30** | **27 / 27** | **0** |
| Dev | 11 hand-written trap meetings, 3 with recordings (minutes vs recording conflicts, time-zone traps, midnight crossings, Singapore chairman route) | 82 / 82 | 37 / 37 | 11 / 11 | 8 / 8 | 0 |
| **Stress** | 12 deliberately hostile meetings: blurry, dim, rotated phone photos at JPEG quality 28; handwritten-style minutes; French hotel bills; 12-hour clocks | 55 / 64 (86%) | 28 / 35 (80%) | 9 / 12 | 8 / 15 | **0** |
| *Baseline: always answer REVIEW* | *The held-out set again, with a "tool" that never decides anything* | – | *17 / 86 ("unproven" is right for 17)* | *16 / 30* | *0 / 27* | *0* |

\* *Dangerous error* = saying PASS, or saying a director was present, when the truth says otherwise. The baseline row is there on purpose: a tool that never commits to anything also makes **0** dangerous errors, so that number alone proves nothing. What matters is getting the verdicts right (30 / 30 against 16 / 30) *while* making no dangerous errors.

The one held-out miss: on one e-ticket Muse Spark returned no facts at all (run-to-run variation; the same file read correctly in earlier runs). The engine treated that director as unproven, the meeting verdict was still correct (REVIEW), and nothing dangerous happened. I report the run as it came out rather than re-running until it was perfect. On the stress set the misses all came out as **REVIEW**: when a blurry boarding pass gave an unreadable name such as "QUINTOCONRADAEL", the matcher refused to guess rather than attach it to a director. The tool degrades towards "a person must look at this", not towards a false pass.

**Cost:** one meeting costs about **$0.03–0.06** of API credit and 30–60 seconds. The full 30-meeting held-out run cost **$0.91**.

**Honest caveats**
- All documents are synthetic, rendered from templates I wrote. Real packs are messier (real handwriting, multi-page bundles, other languages), and the stress set shows accuracy falls as documents get worse.
- The stress set is no longer held out: after its first run I fixed two general problems it exposed (accented and French city names; flights with impossible times from AM/PM misreads). First run: 54/64 facts, 77% of directors, 9/12 verdicts, 0 dangerous errors.
- The first held-out run scored 51.8% of facts because my answer key stored seconds while documents print minutes. I fixed the key, not the model, and re-scored the same saved outputs. Both runs are in the git history.
- On 29 October all three sets were regenerated (independent answer key, coined company names) and re-run live; the earlier scoreboards are kept in [`eval/results/history/`](eval/results/history/).
- Rules: the Jersey law-level tests are from the statute; the stricter points (majority of meetings, majority of directors for strategic decisions) come from practitioner summaries of the Comptroller's guidance, so they are labelled *guidance* and can be switched off. Singapore's 50%/chairman test is from IRAS; IRAS publishes no numeric test for in-person meetings, so that check is labelled as an assumption. See [`docs/SOURCES.md`](docs/SOURCES.md).

**Independent cross-check by a second AI model.** The answer key was generated together with the documents, so I asked a different company's model to read the held-out documents on its own. Three **Grok** agents (xAI) each took 10 of the 30 meetings, given only the documents (renamed neutrally so file names gave no hints) and a blank answer sheet. For each of the 86 directors they answered *"was this director physically in the jurisdiction for the whole meeting?"* (yes / no / cannot tell), with a note showing their own time-zone conversions. They were instructed not to open the answer key or this repository; that was an instruction, not a technical lock.

| Comparison (86 directors) | Agreement |
|---|---|
| Grok vs answer key | **86 / 86** |
| Grok vs Substance Proof | **86 / 86** |
| Substance Proof vs answer key | **86 / 86** |

These labels were made on 28 October, before the company names were changed; the meetings, directors and travel are the same. Grok's answers (35 yes, 34 no, 17 cannot tell) and notes are in [`eval/results/grok-crosscheck-test-set.csv`](eval/results/grok-crosscheck-test-set.csv); score them with `npx tsx scripts/score-labels.ts <csv>`. This is a check by another AI model, not by a person.

## Run it

Requirements: Node 20+ and Chrome (only for regenerating the synthetic documents).

```bash
npm install
npm test                    # 94 tests: rules engine, presence, time zones, names, sanity checks, rule packs, agent guardrails, red-team attacks
cp .env.example .env        # then put your own Meta Model API key in .env (never commit it)
npm run app                 # builds the web app and serves it at http://127.0.0.1:8787
```

- `npm run app` binds to `127.0.0.1` only; your key stays on the server and never reaches the browser. Uploads are kept in `uploads/` (git-ignored).
- `npm run gen` / `npm run gen:test` / `npx tsx scripts/generate-synthetic.ts stress` rebuild the synthetic packs.
- `SET=test npm run eval` re-runs the held-out evaluation (about $1). `REPLAY=<run folder>` re-scores a saved run for free.
- `npm run record` re-records the demo runs used by the public demo.

## Repository map

```
src/engine/      rules engine: presence inference, Jersey and Singapore tests, verdicts (no AI)
src/extract/     Muse Spark + Voice Transcribe extraction, deterministic normalisation
src/agent/       approval-gated evidence agent (function tools + guardrails)
src/rules/       rule packs: Muse Spark drafts them from a law's text; code validates quotes; deterministic executor
src/app/         one function that analyses a pack (used by the server, the demo recorder and the eval)
server/          local server (127.0.0.1) for live analysis
web/             React UI; web/public/demo holds recorded real runs
scripts/         synthetic data generator, evaluation, demo recorder
tests/           vitest tests
eval/results/    scoreboards behind the numbers above
docs/            rule sources, demo script
```

## Not modelled (yet)

Corporate directors (look-through to the individual), alternate directors, and partial attendance (a director present for only some resolutions) are not modelled; presence is judged for the whole meeting. The Art. 5(3) tests apply only to Jersey tax-resident companies carrying on a relevant activity; the tool assumes they apply. A hotel stay is supporting evidence of presence, not proof. Singapore's IRAS test is guidance ("will generally be regarded"), so a miss gives REVIEW rather than NOT MET.

## Red-team review

Before submitting, I asked an outside AI model (Grok) to act as the harshest judge and run attacks on the engine itself. It found four ways to get a false PASS from genuine-looking documents, and the model never noticed: "Jersey City, New Jersey" was read as Jersey; a spouse's boarding pass matched the director by surname; an arrival in January and a departure in December "proved" presence at a June meeting; and the ambiguous zone label "AST" was guessed. It also showed that the minutes, the hostile document, chose the meeting time and could be relabelled as a hotel bill by planted text. All of these are fixed, each with a test that reproduces the attack ([`tests/redteam.test.ts`](tests/redteam.test.ts)): places must be the Channel Island, surname-only matches are refused, arrival/departure brackets must be within 72 hours of the meeting, ambiguous zones are refused, presence is judged at the scheduled time with the minutes checked against it, and each file's role comes from the person, not the model.

## Built during the hackathon

Everything in this repository was written during the hackathon (26 October – 4 November 2026); the commit history starts on 28 October 2026. No earlier code was reused.

**Tools used to build it.** I wrote this with the help of an AI coding assistant. The images for social media and the link preview were made with an AI image generator from prompts I wrote; they show the synthetic documents. Grok (xAI) was used only outside the product: for the cross-check above and as a red-team reviewer. The product itself uses only Meta's models.

## Security

The minutes are written by the party that wants a PASS, so the review treats every document, recording and pasted law as hostile. [`SECURITY.md`](SECURITY.md) lists the threat model and five findings, each shown by a working attack before it was fixed. The worst was that the agent's guardrail blocked "non-compliant" but not "compliant". The review also covers code-level defences that no longer depend on the model behaving well: the minutes and the recording can never supply travel or hotel evidence, a rule's threshold must appear in the quoted law, and every agent tool call is checked even if the model is hijacked. CI runs the type checks, the tests and a 17-attack HTTP suite (CSRF, DNS rebinding, path traversal) on every push.

## Safety and privacy

- Synthetic data only in the demo. Do not upload real client documents to a third-party API without your organisation's approval.
- Calls use Muse Spark in **Standard** mode (`muse-spark-1.3`), never Contributor mode, which would let Meta train on the documents. Every request sets `store: false`, and the agent does not rely on server-side conversation state, so the whole pipeline is compatible with Meta's Zero Data Retention. Uploaded packs are deleted from `uploads/` 24 hours after they were analysed.
- Photos and scans are redacted by SAM 3.1 (QR codes, barcodes, faces, signatures) before Muse Spark reads them. If redaction fails, the image is not sent at all.
- Board packs contain personal data (names, travel, hotel stays, voices). Using this on real clients needs a lawful basis and a cross-border transfer assessment under the applicable law (for example GDPR / UK GDPR, the Data Protection (Jersey) Law 2018, Singapore's PDPA or Mauritius's Data Protection Act 2017). That assessment is not part of this hackathon project.
- The model output is validated by a strict JSON schema and again by code; the agent can only draft, and every draft needs a human decision.
- The app never gives a legal conclusion in its drafts: a guardrail rejects agent messages that state an outcome.

