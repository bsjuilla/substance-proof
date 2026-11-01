# 3-minute demo video: script

Record your screen (Windows: press **Win + Alt + R** with the Xbox Game Bar, or use OBS) with your voice. Open the app first: run `npm run app`, then open http://127.0.0.1:8787 in Chrome at full screen. Speak calmly; the script is about 400 words, which fits in 3 minutes. The analysis in the video is a **recorded live run** (the same one the public demo shows), so there is no waiting on screen; say so once, as below.

---

### 0:00–0:05 · What I built (say it first; the organisers ask for this line)
> "Everything in this video was built this week, from scratch, for this hackathon."

### 0:05–0:15 · Hook (show: the home page, the evidence desk and the NOT MET card)
> "These minutes say all three directors met in Jersey. One was in Dubai, and another was still on a plane. Substance Proof caught both, and points to the exact page and the exact second of the recording."

### 0:15–0:40 · The problem (show: scroll to the case ledger)
> "In Jersey, a company is managed there only if, among other things, a quorum of its directors is physically in Jersey when the board meets. Getting it wrong can mean fines up to a hundred thousand pounds. Today someone checks this by hand, and the minutes only record what people claimed. I'm an accounting student interning at a trust company, so I've watched people do this. It's for whoever has to rely on minutes they didn't write: an auditor, a tax adviser, a compliance officer. All documents here are synthetic."

### 0:40–1:25 · The case (show: click "Open the case"; this is a recorded live run)
> "This is a recorded run of four Meta models. SAM 3.1 blacks out QR codes and faces on photos. Muse Spark reads every document, even phone photos and scans, and Muse Voice Transcribe turns the recording into a roll-call, each fact with the words it came from. Then Muse Glimmer, Meta's open-weight model, reads everything again on its own; if it disagrees, a person looks."
(Scroll to the timeline.)
> "Alice: only a hotel bill, and a hotel bill alone isn't proof, so she's unproven. Bruno: the minutes say St Helier, but his hotel bill and his own words on the recording say Dubai." (Click the recording chip, let it play 3 seconds.) "Chandra: her e-ticket shows she was still in the air."

### 1:25–1:50 · The rules (show: Rule tests)
> "The AI doesn't decide. Tested code applies the published rule: the quorum is two, and the evidence puts two of three directors outside Jersey, so this meeting can't meet the test."

### 1:50–2:10 · The agent (show: drafts, click Approve on one, open the tool calls)
> "A Muse Spark agent drafts corrections, quoting both sides. Code checks every tool call, and nothing is sent until a person approves."

### 2:10–2:45 · Proof it works (show: README results table, then the "Fraud review" table)
> "On thirty held-out synthetic meetings it got every verdict right, with zero dangerous errors. Then I had another AI attack it as a judge, a buyer and a fraudster. The best attack came through the form: tick 'lives in Jersey', say 'I'm dialling in from Lisbon', and it passed. Every attack it found is fixed and is now a test."

### 2:45–3:00 · Close (show: the hero verdict again)
> "Substance Proof: the minutes say the board met in Jersey. Now you can check. Built with Muse Spark, Voice Transcribe, SAM 3.1 and open-weight Muse Glimmer."

---

**15-second clip for X:** screen-record the home page hero (0:00–0:12), then the moment you click the recording chip and Bruno says he is "dialing in from my hotel in Dubai". Use the X post in `docs/SUBMISSION.md`.
