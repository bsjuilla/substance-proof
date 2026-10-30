# 3-minute demo video: script

Record your screen (Windows: press **Win + Alt + R** with the Xbox Game Bar, or use OBS) with your voice. Open the app first: run `npm run app`, then open http://127.0.0.1:8787 in Chrome at full screen. Speak calmly; the script is about 380 words, which fits in 3 minutes. The analysis in the video is a **recorded live run** (the same one the public demo shows), so there is no waiting on screen; say so once, as below.

---

### 0:00–0:12 · Hook (show: the home page, the evidence desk and the FAIL card)
> "These minutes say all three directors met in Jersey. One of them was in Dubai, and another was still on a plane from London. Substance Proof caught both, and points to the exact page and the exact second of the recording."

### 0:12–0:35 · The problem (show: scroll to the case ledger)
> "In Jersey, a company is treated as managed there only if, among other things, a quorum of its directors is physically in Jersey when the board meets. Getting substance wrong can mean fines of ten thousand pounds, then up to a hundred thousand. Today a company secretary checks this by hand, and the minutes only record what people claimed. I'm an accounting student interning at a trust company, so this is a job I've watched people do. Everything you'll see uses synthetic documents."

### 0:35–1:20 · The case (show: click "Open the case"; this is a recorded live run)
> "This is a recorded run of Meta's models on the meeting pack: the minutes, the travel documents, hotel bills and the meeting recording. Muse Spark reads every document, even phone photos and scans, and Muse Voice Transcribe turns the recording into a roll-call. Every fact comes back with the words it was read from."
(Scroll to the timeline.)
> "Alice: a hotel in St Helier covers the whole meeting. Bruno: the minutes say St Helier, but his hotel bill and his own words on the recording say Dubai." (Click the recording chip, let it play 3 seconds.) "Chandra: her e-ticket shows she was still in the air from London when the meeting ended."

### 1:20–1:50 · The rules (show: Rule tests)
> "The AI doesn't decide. Tested code applies the published rule: the company's own quorum is two, and the evidence shows only one director physically in Jersey, so this meeting doesn't meet the test. Stricter points from guidance are labelled separately."

### 1:50–2:15 · The agent (show: drafts, click Approve on one, open the tool calls)
> "An agent built on Muse Spark's tool calling drafts corrections for the company secretary, quoting both sides. Code checks every tool call, and nothing is sent until a person approves."

### 2:15–2:45 · Proof it works (show: README results table, then tests/redteam.test.ts briefly)
> "On thirty held-out synthetic meetings, scored against an answer key the engine didn't write, it got every verdict right and made zero dangerous errors. I also had another AI attack it. It found four ways to fake a pass, like reading 'Jersey City, New Jersey' as Jersey. Every one is fixed and is now a test."

### 2:45–3:00 · Close (show: the hero verdict again)
> "Substance Proof: the minutes say the board met in Jersey. Now you can check. Built with Muse Spark and Muse Voice Transcribe."

---

**15-second clip for X:** screen-record the home page hero (0:00–0:12), then the moment you click the recording chip and Bruno says he is "dialing in from my hotel in Dubai". Use the X post in `docs/SUBMISSION.md`.
