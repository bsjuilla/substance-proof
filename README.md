# Substance Proof

[![CI](https://github.com/bsjuilla/substance-proof/actions/workflows/ci.yml/badge.svg)](https://github.com/bsjuilla/substance-proof/actions/workflows/ci.yml) · MIT licence ([LICENSE](LICENSE))

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

**Who it is for.** The person who has to rely on the minutes without having written them: an auditor or tax adviser reviewing a client's board files, a buyer's due-diligence team going through years of minutes, the compliance officer of a trust company checking the boards it administers, or internal audit at a group with offshore subsidiaries. A company checking itself can use it too, but it chooses what goes in, so its result is only as honest as its pack (see *Fraud review* below); the printed memo lists what was entered by hand and not proven.

I am an accounting and finance student interning at a trust and corporate-services firm, where this kind of record-keeping is everyday work.

**Verdicts.** Each meeting gets one of three: **EVIDENCED** (every condition is backed by evidence; "PASS" in the code and the scoreboards), **REVIEW** (something is unproven or contradicted, so a person must look), or **NOT MET** (the evidence shows a condition in the law is not met *for this meeting*). One meeting cannot fail the law on its own; the substance test is judged for the whole year. None of them is a legal conclusion: the report says so, and the printed memo has lines for the preparer and the reviewer to sign.

**What counts as evidence of presence.**
- **Proof:** a flight that landed in the jurisdiction before the meeting and a flight that left it after, each within 72 hours, with no flight in between; and, unless both are within 24 hours of the meeting, a hotel stay there that covers it.
- **Support only:** a hotel bill alone (a room can be booked and never used), one flight without the other, or two flights days apart with nowhere to stay. These go to REVIEW. They are still enough to show a director was *away*.
- **Residence:** a director who lives in the jurisdiction counts as present on a residence document the firm has checked, unless travel, or any claim that does not name the jurisdiction ("dialling in from Lisbon", "by telephone"), says otherwise.
- **Claims:** the minutes and the recording can contradict the evidence but never supply it.

## What it does (three steps)

1. **Read.** Drop in the meeting pack. Muse Spark reads every document and image, and Muse Voice Transcribe turns the recording into a roll-call. Each fact (who, where, when) comes back with the exact words it was read from.
2. **Decide.** A deterministic, unit-tested rules engine (not the AI) works out where each director was during the meeting and applies the jurisdiction's test. It flags contradictions between the minutes, the recording and the evidence.
3. **Act.** An evidence agent (Muse Spark with tools) drafts requests for missing evidence and corrections to inaccurate minutes. Every tool call is checked by code. **Nothing is sent**: each draft waits for a person to approve or decline it.

![Report for the demo meeting: NOT MET, quorum not evidenced in Jersey](docs/screenshot-report.png)

## How Meta's models are used

| Model | Job | What breaks without it |
|---|---|---|
| **Muse Spark 1.3** (vision + PDF, strict JSON-schema output) | Reads minutes, boarding passes, e-tickets, phone photos, scanned pages and hotel bills; returns each fact with a verbatim quote | Nothing gets read: no facts, no timeline |
| **SAM 3.1** (text-prompted segmentation) | **Privacy before reading.** On every photo (PNG, JPG, WebP), finds the QR code or barcode (which encodes the passenger's name and booking), faces and signatures (faces and signatures are best effort, see Safety and privacy); code blacks out what it finds and only that copy is sent to Muse Spark. The viewer shows what was masked. | Personal data the check doesn't need goes to the reader |
| **Muse Voice Transcribe** (diarization, keyword hints) | Turns the meeting recording into turns with timestamps. Recordings of any length and format (WAV, MP3, M4A, MP4…) are converted and split into pieces under the 10-minute limit, then stitched onto one timeline | The recording can't be used as evidence; minutes-versus-recording conflicts are invisible |
| **Muse Spark 1.3** (transcript reasoning) | Finds who said where they were joining from, with the turn it was said in | Spoken claims can't be cited to the second |
| **Muse Spark 1.3** (function tools, approval-gated agent) | `list_gaps`, `get_rule_result`, `draft_evidence_request`, `draft_minutes_correction`. Stateless: it sends its own history each step and nothing is stored at Meta, so it also runs on a Zero Data Retention account | No follow-up: gaps stay gaps |
| **Muse Spark 1.3** (long context, strict schema) | **Writes the rules from the law.** Reads a full statute or official guidance (about 10,000 tokens of source) and drafts a rule pack: each rule as data, with the exact words of the law behind it | Every new jurisdiction needs a developer to hand-code it |
| **Muse Glimmer 30B** (Meta open weights, Apache 2.0; optional) | **A second, independent reader.** Reads every document again from scratch as images (PDF pages are rendered, photos are the SAM-redacted copy), with no access to Muse Spark's answer. Code then decides the meeting a second time from Glimmer's reading with the same engine. If any director's presence or the verdict would change, a `SECOND-READER` evidence check fails and the meeting goes to REVIEW. It can only make a result more careful, never turn REVIEW or NOT MET into PASS. Runs on NVIDIA's hosted API here; because the weights are open, a firm can run it on its own machines | One model's misread is final: nothing catches a skipped e-ticket |

### Add a jurisdiction by giving it the law

Muse Spark reads the whole official text and proposes rules, choosing only from test types the engine can compute (quorum present, share of directors present or the chair, minutes record strategic decisions, records kept, and so on). Code then checks each proposal: **its quote must appear word for word in the source**, and its parameters must be valid. Requirements the engine can't compute (for example "adequate frequency" with no number, staff or expenditure) must be listed as *not checkable* rather than dropped silently. A person approves the pack in the app before it is used.

Measured on the official texts (Jersey statute from jerseylaw.je; IRAS company-residency guidance):
- Every proposed rule's quote was found word for word in the source, and code refuses a quote that stops in the middle of a clause (so "meets in Jersey" cannot drop "at an adequate frequency…").
- Muse Spark wrote the Jersey pack (meetings in Jersey, quorum, minutes, records: Art. 5(3)(a), (b), (c) and (e); (d), the directors' knowledge and expertise, it listed as not checkable, and (a)'s "adequate frequency" is not checked) and the Singapore pack (at least 50% of directors with strategic authority, or the chairman, for virtual or hybrid meetings) from the raw text alone.
- **Decided with the AI-written packs, all 41 dev and held-out meetings got the same law-level verdict as the hand-written rules, in 3 out of 3 independent runs** ([`eval/results/rulepack-agreement.json`](eval/results/rulepack-agreement.json)). After the presence rules changed on 31 October, the published pack was measured again without calling the model (`RECHECK=1`): it still agrees on all 42 meetings, including the new m12.
- Honest note: before I tightened the prompt, one run turned IRAS's descriptive sentence "*Usually, the location of the company's Board of Directors meetings … determines …*" into a hard rule, which changed 2 of 41 verdicts. The prompt now tells the model to encode only stated conditions, and the human approval step exists for exactly this kind of mistake.

`npx tsx scripts/build-packs.ts` reproduces this (about $0.20 for 3 runs; `costUsd` is 0.2017 in [`eval/results/rulepack-agreement.json`](eval/results/rulepack-agreement.json)). In live mode, *Rules written from the law* lets you paste any substance law and see the proposed rules with their quotes; *Decide with the rules Muse Spark wrote* runs a meeting with the AI-written pack instead of the hand-written rules.

The model **never decides** a legal test. The line between AI and code is deliberate:

- **AI:** finds, reads and quotes; drafts messages.
- **Code:** time zones (labels like `GST`, `GMT+8`, `UTC+04:00`, IANA names, or "local time" resolved from the venue), name matching (including airline style `CASTELL/BRUNO` and speech-recognition spelling slips, accepted only when one director is clearly closest), physical sanity checks (a flight must land after it leaves), presence inference, the rule tests, contradiction detection, and the guardrails on every agent tool call.

## Results

Every number below comes from a script in this repo (`npm run eval`); the scoreboards are in [`eval/results/`](eval/results/).

**Where the answer key comes from.** The synthetic generator knows what really happened in each meeting (who stayed where, who flew when), so the truth is exact. The expected verdict for each meeting is computed by an **independent oracle** ([`scripts/oracle.ts`](scripts/oracle.ts)): a second, deliberately simple implementation of the rules that shares no code with the engine. When the documents are generated, the engine is also run on the *true* facts, and every disagreement with the oracle is reported; there are none on all 54 meetings. The scores below therefore measure the whole system (reading, matching, time zones, rules) against a key the engine did not write.

| Set | What it is | Facts read exactly | Directors placed correctly | Meeting verdicts | Contradictions caught | Dangerous errors* |
|---|---|---|---|---|---|---|
| **Held-out test** | 30 randomised meetings, 110 files: e-tickets, tilted phone photos, scanned image-only minutes, prose minutes, letter-style hotel bills, airline-style names. Read live on 1 November with the current instructions (see the caveats for what was changed after seeing it). | **166 / 166** | **86 / 86** | **30 / 30** | **27 / 27** | **0** |
| Dev | 12 hand-written trap meetings, 3 with recordings (minutes vs recording conflicts, time-zone traps, midnight crossings, Singapore chairman route, directors who live in Jersey). Read live on 2 November. | 88 / 88 | 40 / 40 | 12 / 12 | 8 / 8 | 0 |
| **Stress** | 12 deliberately hostile meetings: blurry, dim, rotated phone photos at JPEG quality 28; handwritten-style minutes; French hotel bills; 12-hour clocks. Readings from 29 October, scored with today's code. | 55 / 64 (86%) | 28 / 35 (80%) | 9 / 12 | 8 / 15 | **0** |
| **Realistic (outside reviewer)** | 16 meetings, 81 files that Grok designed to look like real packs, with its answers registered before each run: year-less boarding passes, date-only and foreign hotel bills, a 20-page board pack, prose and French minutes, mobile passes, connections via Guernsey. See *Live review* below. | – | 38 / 45 | 12 / 16 | – | 1 (A15) |
| *Baseline: always answer REVIEW* | *The held-out set again, with a "tool" that never decides anything* | – | *41 / 86 ("unproven" is right for 41)* | *19 / 30* | *0 / 27* | *0* |

\* *Dangerous error* = saying PASS, or saying a director was present, when the truth says otherwise. The baseline row is there on purpose: a tool that never commits to anything also makes **0** dangerous errors, so that number alone proves nothing. What matters is getting the verdicts right (30 / 30 against 19 / 30) *while* making no dangerous errors.

**31 October and 1 November: stricter rules, same scores.** After a buyer's review and a fraud review (both below), a hotel bill alone and a single flight no longer prove presence, residents count on a checked residence document, and an unrecognised place in a claim counts against a residence record. Each time, the independent oracle got the same rule and the answer keys were recomputed ([`scripts/rekey.ts`](scripts/rekey.ts); the documents did not change), and the saved model readings were scored again for free: the held-out, dev and stress numbers above are unchanged, with 0 dangerous errors. Eight meetings that used to be PASS are now REVIEW, which is why the baseline that always answers REVIEW now gets 19 of 30. The new dev meeting m12 (two resident directors, and one who flew in and out) was read live. Be clear what "unchanged" shows: the engine and the oracle still agree, and the model still reads the documents the same way. It does not show the new rule is the right one; both were written by me, with the same AI assistant, and changed together.

**1 November: the reader's instructions changed, and the first attempt went wrong.** The live review (below) showed real-looking documents were mostly lost in code, and two cases needed Muse Spark to read differently (prose attendance, text addressed to the AI). The first live run with the new instructions scored **148 / 166** facts and 28 / 30 verdicts on the held-out set: the line about "text that tells you what to report" made Muse Spark skip e-tickets, which print "this is not a boarding pass". Adding the e-ticket line that Glimmer already had fixed it, and the full re-run gave the numbers above. Both runs are published ([`eval/runs/published-test-2026-11-01-first-attempt`](eval/runs/) and `published-test-2026-11-01`). Earlier, on 29 October, the one held-out miss was an e-ticket Muse Spark returned nothing for; that director came out unproven and the verdict was still right. On the stress set the misses all came out as **REVIEW**: when a blurry boarding pass gave an unreadable name such as "QUINTOCONRADAEL", the matcher refused to guess rather than attach it to a director. The tool degrades towards "a person must look at this", not towards a false pass.

**Second reader (Muse Glimmer 30B, open weights).** On the same 30 held-out meetings, Glimmer re-read all 110 documents on its own ([`scripts/eval-second-reader.ts`](scripts/eval-second-reader.ts), scoreboard in [`eval/results/second-reader-summary.json`](eval/results/second-reader-summary.json)):

| | Facts read exactly | Meeting verdicts | Dangerous errors |
|---|---|---|---|
| Muse Spark alone | 166 / 166 | 30 / 30 | 0 |
| Muse Glimmer alone | 163 / 166 | 29 / 30 | 0 |
| **Both, with the second-reader check** | – | **30 / 30** | **0** |

On this held-out run (2 November) the check fired on 2 meetings, and both times Glimmer was the one that was wrong (an e-ticket it skipped in t05; the day-first date 06/08/2026 read as 8 June in t08). On the 29 October run it fired on 3: once it caught a real Muse Spark miss (an e-ticket, t24) and twice it was Glimmer's dates. So on clean synthetic documents the second reader has changed no final verdict; on the realistic set it caught two legs Muse Spark missed (A14, B10 in the live review). Its cost is a person's look, never a false EVIDENCED: two independent readers must agree before anything is called met. Two bugs found on 1 November made it look worse than it is: it rendered PDFs whose fonts are not embedded (most office-made PDFs) as **blank pages**, and it only looked at the first 3 pages of a PDF, so it missed attendance on page 6 of a board pack. Both are fixed; on the realistic set its agreement with Muse Spark went from 6 / 51 facts to 95 / 101.

**Cost:** one meeting costs about **$0.03–0.09** of Meta API credit. Muse Spark alone takes 30–70 seconds; with the second reader on, the five recorded demo runs took 1.5 to 7 minutes, mostly waiting on NVIDIA's hosted API. The full 30-meeting held-out run of 1 November cost **$1.14** (summed in [`eval/results/test-summary.json`](eval/results/test-summary.json); the 29 October run cost $0.92).

**Honest caveats**
- All documents are synthetic. The held-out, dev and stress sets are rendered from templates I wrote; the realistic set was designed by an outside AI reviewer to look like real packs, and the product does much worse there (38 / 45 directors, 12 / 16 verdicts) than on my own templates. Real packs are messier still (real handwriting, multi-page bundles, other languages), and the stress set shows accuracy falls as documents get worse. The synthetic world is also easier than the real one: every document prints a time zone (real boarding passes print local time only; the code now uses the airport's own zone), and flight times are not realistic for the route.
- **A capable chatbot ties it on this set.** In the fraud review, Grok read held-out meetings t01–t10 from the documents alone and got 10 / 10 verdicts and 26 / 26 directors, the same as the product (it had read the rules first; its answers are in its report). On clean synthetic packs, reading accuracy is not what sets the product apart. What it adds is everything around the reading: the same answer every time from tested code, a citation for every fact, refusing to guess (unreadable names, missing zones), contradictions between the minutes, the recording and the evidence, a second independent reader, and a memo a reviewer can sign.
- **"0 dangerous errors" was barely tested where it matters.** Only 1 of the 30 held-out meetings is expected to be EVIDENCED, and none has a resident director. The attacks that do produce a false EVIDENCED are tested directly in [`tests/redteam.test.ts`](tests/redteam.test.ts) instead.
- **Three changes were made after seeing held-out results:** the matcher joins a name split by letter spacing ("PR IYA"); the second reader's instructions gained a line about e-tickets (31 October); and on 1 November the same e-ticket line went into Muse Spark's instructions after the first attempt with the new instructions dropped to 148 / 166. The other 1 November changes came from the outside reviewer's realistic set, not from the held-out set. So the held-out set is no longer strictly held out; the realistic set is the fairer test of documents I did not design.
- **Demand:** the fraud review found no published count of Jersey substance failures, and the EU's monitoring group made no recommendations to Jersey in 2026. The case for the tool is records a firm can stand behind when asked, not a wave of fines.
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

These labels were made on 28 October, before the company names were changed; the meetings, directors and travel are the same. They also follow the rule of that time: a hotel stay covering the meeting meant "yes". Against today's stricter key, Grok agrees on 62 / 86; all 24 differences are directors placed by a hotel bill alone, whom Grok marked "yes" and the key now marks "cannot tell". Grok's answers (35 yes, 34 no, 17 cannot tell) and notes are in [`eval/results/grok-crosscheck-test-set.csv`](eval/results/grok-crosscheck-test-set.csv); score them with `npx tsx scripts/score-labels.ts <csv>`. This is a check by another AI model, not by a person.

## Run it

Requirements: Node 20+ (CI uses Node 22) and `git` (the eval scripts record the commit, and report "unknown" outside a git checkout). Chrome is needed only to regenerate the synthetic documents. **No API key is needed** to run the app, the tests or the replays.

```bash
npm ci
npm test                    # 133 tests: rules engine, presence, time zones, names, sanity checks, rule packs, agent guardrails, red-team attacks, second reader
npm run app                 # recorded mode: the five real recorded runs, no key. Serves http://127.0.0.1:8787
# Optional, for live analysis of your own packs:
cp .env.example .env        # then put your own Meta Model API key in .env (never commit it); restart the app
```

Port 8787 busy? `PORT=8790 npm run app`. Without a key the upload area is hidden; everything else works.

- `npm run app` binds to `127.0.0.1` only; your key stays on the server and never reaches the browser. Uploads are kept in `uploads/` (git-ignored).
- `npm run gen` / `npm run gen:test` / `npx tsx scripts/generate-synthetic.ts stress` rebuild the synthetic packs.
- `SET=test npm run eval` re-runs the held-out evaluation (about $1). The model outputs behind every published number are in [`eval/runs/`](eval/runs/), so anyone can re-score them for free and without a key: `SET=test REPLAY=published-test-2026-11-01 npm run eval` (also `published-dev-2026-11-02` with `SET=dev`, `published-stress-2026-10-29` with `SET=stress`, and the earlier runs), and `SET=test REPLAY=published-test-2026-11-01 GLIMMER_REPLAY=published-glimmer-test-2026-11-02 npx tsx scripts/eval-second-reader.ts`. The realistic set: `npx tsx scripts/score-realistic.ts`.
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

Corporate directors (look-through to the individual), alternate directors, and partial attendance (a director present for only some resolutions) are not modelled; presence is judged for the whole meeting. The Art. 5(3) tests apply only to Jersey tax-resident companies carrying on a relevant activity; the tool assumes they apply. Mauritius, Guernsey and Isle of Man places are recognised, but there are no rule packs for them yet (Mauritius looks at whether two resident directors attend, not at a quorum on the island). Singapore's IRAS test is guidance ("will generally be regarded"), so a miss gives REVIEW rather than NOT MET.

## Red-team review

Before submitting, I asked an outside AI model (Grok) to act as the harshest judge and run attacks on the engine itself. It found four ways to get a false PASS from genuine-looking documents, and the model never noticed: "Jersey City, New Jersey" was read as Jersey; a spouse's boarding pass matched the director by surname; an arrival in January and a departure in December "proved" presence at a June meeting; and the ambiguous zone label "AST" was guessed. It also showed that the minutes, the hostile document, chose the meeting time and could be relabelled as a hotel bill by planted text. All of these are fixed, each with a test that reproduces the attack ([`tests/redteam.test.ts`](tests/redteam.test.ts)): places must be the Channel Island, surname-only matches are refused, arrival/departure brackets must be within 72 hours of the meeting, ambiguous zones are refused, presence is judged at the scheduled time with the minutes checked against it, and each file's role comes from the person, not the model.

## Buyer review

The red team asked "can it be fooled?". The second review asked "would anyone pay for it?". I gave Grok the role of a managing director of a Jersey trust company with a Mauritius office and about 300 client companies, and told it to test everything in the key-free recorded mode and decide whether it would buy. It ran the app, took 44 screenshots, ran 11 real-life cases against the engine, and checked the demo's quotes against the PDFs. Its answer: not as a subscription today; a small paid pilot first. Its biggest finds, all fixed with tests in [`tests/redteam.test.ts`](tests/redteam.test.ts):

- **A hotel bill alone gave a false PASS** (a room booked for a director who never came). It now only supports presence (and since the fraud review, a flight in *and* a flight out are needed).
- **Directors who live in Jersey could never be shown as present**, so a normal board of locals always went to REVIEW. A residence record now counts, unless travel or a claim puts them elsewhere (demo meeting m12).
- **"Jersey Road, Hounslow, London" was read as Jersey.** An address that names two places is now refused; Jersey parishes and postcodes, and Mauritius, Guernsey and Isle of Man places, are known.
- **A blank quorum on the upload form became 2.** The quorum from the articles is now required.
- **The printed memo was not a file note.** It now has preparer and reviewer lines, a SHA-256 fingerprint of every file, the rules and models used, the limits of the check, and only the approved drafts. Approvals survive a reload.
- **"PASS" read like a legal conclusion.** It is shown as EVIDENCED, with what exactly is evidenced.

## Fraud review

The third review asked Grok to play seven critics at once, including a professional director who wants a meeting to look EVIDENCED when it was not. Its key point, which none of the earlier reviews made: **the person filling in the form can be the fraudster.** The documents were treated as hostile; the form was not. Reproduced and fixed, each with a test in [`tests/redteam.test.ts`](tests/redteam.test.ts), [`tests/pack.test.ts`](tests/pack.test.ts) and [`tests/agent.test.ts`](tests/agent.test.ts):

| Attack | Before | Now |
|---|---|---|
| Tick "lives in Jersey"; the recording says "dialling in from Lisbon" (any place outside the code's list), or the minutes say "by telephone" or "St Helier (joined by video from Dubai)" | EVIDENCED: the unrecognised place was silently dropped | REVIEW: a claim that does not name the jurisdiction counts against the residence record |
| Tick "lives in Jersey" with nothing else | EVIDENCED on a tick box | A residence document must be attached for that director; its fingerprint goes in the memo, and it is never sent to a model |
| The wife's boarding pass ("CASTELL/BRUNA") for director Bruno | Matched by spelling distance | Refused: on documents only a misprinted surname or a doubled letter is forgiven, never a different first name |
| Arrive the day before, leave the early flight out of the pack | EVIDENCED | REVIEW: a flight out is needed too |
| Flights 71 hours before and 71 hours after, nowhere to stay | EVIDENCED | REVIEW: beyond 24 hours a hotel stay must cover the meeting |
| Scope the AI-written quorum rule to video meetings only, or mark it "guidance" | NOT MET became EVIDENCED, and the pack passed validation | Refused: a scope must be stated in the law around the quote, and a test written from a statute cannot be made switchable |
| Agent drafts "We can confirm you were physically in Jersey" or a link to a look-alike upload portal | 9 of 13 such sentences got through | Blocked, including links of any kind |
| A 448-byte PDF that declares a giant page | 2.36 GB of memory in the second reader | Pages are capped at 2,000 pixels: 339 MB, under a second |
| A real boarding pass that prints local time without a zone | Rejected | Read in the airport's own zone (about 130 airports) |

What it cannot fix: the tool checks the documents it is given. If a preparer leaves out the two Dubai files and attaches a residence document, the result is EVIDENCED, and the quorum and the "strategic" flag are typed by hand. The report and the memo now say so, listing every value that was entered rather than proven, so the reviewer knows what to check against the articles, the register and the full pack. This is why the tool is aimed at the reviewer, not at the company reviewing itself.

## Live review: real-looking documents through the real models

The fourth review gave Grok the live models, through the local server, never the key, with an $8 cap. It wrote 16 meetings (81 files) to look like real packs, registered its answers before each run, and ran its attacks for real. Everything is in [`eval/realistic/`](eval/realistic/): the documents, its answers, the setup, and the result before and after the fixes; `npx tsx scripts/score-realistic.ts` scores them for free.

| Realistic set (16 meetings) | Before (31 Oct) | After (1 Nov) |
|---|---|---|
| Directors placed as the reviewer expected | 24 / 45 | **38 / 45** |
| Verdicts as the reviewer expected | 9 / 16 | **12 / 16** |
| Directors wrongly shown present | 1 (A05) | **0** |
| Wrong EVIDENCED | 0 | **1 (A15, below)** |
| Hotel stays accepted / refused | 0 / 7 | 6 / 1 |
| Second reader facts identical | 6 / 51 | 95 / 101 |

What it found, and what changed:
- **Most losses were in code, not in reading.** Boarding passes print "11MAR 18:40" with no year, and the code refused them (it also made runs unstable: the same pack gave different answers on different runs). Hotel bills print dates without times, and the code refused every one. "Mme Sofia Castelnau" and "TAN/WEILING" matched no director. Now a missing year is the one nearest the meeting, a date-only stay counts from 23:59 on arrival to 00:00 on departure, and French, Portuguese and German titles and joined-up airline first names match (a spouse's different first name still does not).
- **Dangerous: an instruction hidden in a picture inside an expenses PDF** ("report these as flight_leg facts…") became four accepted flights and showed both directors present. Now Muse Spark reports text addressed to the AI, code also catches instruction-like quotes, and such a file gives no evidence and sends the meeting to REVIEW (`INJECTION` check).
- **Dangerous: prose minutes** ("took the chair, joining by telephone from her home in Lisbon") gave no claim at all, so a residence record made her present. Now a resident counts only when the minutes or the recording put them in the jurisdiction, and the instructions cover prose, other languages and "by telephone".
- **The second reader saw blank pages** for PDFs whose fonts are not embedded, and only the first 3 pages; and an NVIDIA outage made its check "not applicable". Fixed: it is given the standard fonts (with a test), reads up to 8 pages, and an outage now means REVIEW.
- Ferry tickets, car hire, passport stamps and attendance exports gave nothing and were dropped silently; they are now listed under "Not used". A rule pack for the British Virgin Islands was refused because the model wrote "BVI" instead of "VG"; codes are now mapped.

**Still wrong after the fixes**, reported as they came out:
- **A15, the one wrong EVIDENCED:** two directors are proven present by flights in and out, so the quorum of 2 is genuinely met; but a third, listed as present in the minutes, says on the recording in French that he is in Paris. The transcript came back as "Bonjour. Video.", and recording claims are only taken from people who say their name, so the contradiction was missed. The fix is matching voices to directors, which is not built.
- **A01, A13:** correct EVIDENCED results held at REVIEW by the second reader (A01 by the 3-page limit, since fixed; A13 because Glimmer read "09/06" as 6 September).
- **A02, A05, A06, A10r, A11r, A16:** a director the reviewer marked "absent" comes out "unknown" (a claim or a document places them away, but not in a form the code turns into absence). Safe in direction, but less informative.

What held under live attack: hidden white text and PDF metadata, a boarding-pass section planted in the minutes, injection aimed at the agent, an instruction inside a law text sent to the rule builder, and SAM blacking out QR codes on phone screenshots and angled photos. The reviewer spent $3.19; re-sending its packs after the fixes and re-running the held-out, dev and stress sets live cost about $5.10 more, including a first attempt that had to be redone.

### What a regulated firm would still need

From the same review. None of this is built; it is listed so nobody mistakes the demo for a product a firm can deploy today: a written data-processing agreement and a list of sub-processors (Meta, and NVIDIA when the second reader is on); a JFSC outsourcing notification pack; user accounts, roles and an audit log; saved cases that can be reproduced years later (the Comptroller can decide that a period failed the test up to six years after it ended, Art. 6(1)); a company and director register with the quorum from the articles; a year view that answers the economic substance return's questions on board meetings; bulk intake; an attendance register signed on the day; reminders and a portal for directors to send their evidence; rule packs for Mauritius, Guernsey, the Isle of Man, BVI and Cayman, reviewed by counsel; and running the models inside the firm. Above all, it needs measuring on real board packs: every number above is on synthetic documents.

## Built during the hackathon

Everything in this repository was written during the hackathon (26 October – 4 November 2026); the first commit is on 28 October 2026 (10:08, UTC+4) and every commit is by one author. No earlier code was reused. Open-source dependencies are listed in `package.json`, each used under its own licence.

**Tools used to build it.** I wrote this with the help of an AI coding assistant. The images for social media and the link preview were made with an AI image generator from prompts I wrote; they show the synthetic documents. Grok (xAI) was used only outside the product: for the cross-check above and as a red-team reviewer. The product itself uses only Meta's models.

## Security

The minutes are written by the party that wants a PASS, so the review treats every document, recording and pasted law as hostile. [`SECURITY.md`](SECURITY.md) lists the threat model and five findings, each shown by a working attack before it was fixed. The worst was that the agent's guardrail blocked "non-compliant" but not "compliant". The review also covers code-level defences that no longer depend on the model behaving well: the minutes and the recording can never supply travel or hotel evidence, a rule's threshold must appear in the quoted law, and every agent tool call is checked even if the model is hijacked. CI runs the type checks, the tests and a 17-attack HTTP suite (CSRF, DNS rebinding, path traversal) on every push.

## Safety and privacy

- Synthetic data only in the demo. Do not upload real client documents to a third-party API without your organisation's approval.
- **Data use while building this.** The code calls the Standard model ID `muse-spark-1.3` (set in `src/extract/client.ts`; there is no `-contributor` ID anywhere in the code or the recorded runs). But this project was built on the free hackathon credits, and Meta's billing page for the account says: "While using free credits your content may be used for product improvement." So during the hackathon, Meta may have used the content sent to the model. That is acceptable here because **every document sent was synthetic**. For real client documents, stop using free credits and pay as you go: Meta's docs say "In Standard mode, your content is not used to train Meta models" (Muse Voice Transcribe has no Contributor mode), and ask Meta to enable Zero Data Retention.
- Every request sets `store: false`, and the agent does not rely on server-side conversation state, so the pipeline is compatible with Zero Data Retention. While the server runs, it deletes uploaded packs from `uploads/` once they are more than 24 hours old (checked every hour).
- The optional second reader (Muse Glimmer) is off unless `NVIDIA_API_KEY` is set. When it is on, documents also go to NVIDIA's hosted API; Glimmer is open-weight, so for real documents it can run on the firm's own hardware instead.
- Photos (PNG, JPG, WebP) are checked by SAM 3.1, which is asked to find QR codes, barcodes, faces and signatures and black out what it finds, before Muse Spark reads them. In the live review it found the QR code on every boarding-pass photo, including phone screenshots and angled photos; it found nothing on a photographed ID card with a drawn face, a signature and a barcode (test D01), so faces and signatures are best effort, not a guarantee. If redaction fails, the image is not sent to Muse Spark at all. **Scanned PDFs are not redacted yet:** they go to the reader as they are. The blacked-out copies are deleted as soon as both readers have finished. SAM itself runs on Meta's API, so Meta does receive the original photo in order to find what to black out; only the reader gets the blacked-out copy.
- Board packs contain personal data (names, travel, hotel stays, voices). Using this on real clients needs a lawful basis and a cross-border transfer assessment under the applicable law (for example GDPR / UK GDPR, the Data Protection (Jersey) Law 2018, Singapore's PDPA or Mauritius's Data Protection Act 2017). That assessment is not part of this hackathon project.
- The model output is validated by a strict JSON schema and again by code; the agent can only draft, and every draft needs a human decision.
- The app never gives a legal conclusion in its drafts: a guardrail rejects agent messages that state an outcome.

