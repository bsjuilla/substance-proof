# 3-minute demo video: script, shot by shot

Target 2:52, hard stop 3:00. About 315 spoken words, at roughly 2.3 words a second. Record the screen at 1440 x 900 with the browser at 110% zoom (Windows: Win + Alt + R with the Xbox Game Bar, or OBS), with your own voice. Open the app first: run `npm run app`, then open http://127.0.0.1:8787 in Chrome. The app is in recorded mode (no key needed): the analysis in the video is a **recorded live run**, the same one the public demo shows, so there is no waiting on screen.

Rehearse once with a timer. If a take runs long, drop shot 10 (22 words, 12 seconds).

| # | Time | On screen (exactly) | Said | Words |
|---|---|---|---|---|
| 1 | 0:00-0:12 | Home page. Cursor rests on the evidence desk: the recording line "I'm dialing in from my hotel in Dubai" next to the red NOT MET card. | "These board minutes say all three directors met in Jersey. The recording says one of them was in Dubai. Substance Proof caught it, and shows you the exact second." | 29 |
| 2 | 0:12-0:30 | Scroll to "Three sources. One claim. They don't agree." Highlight the three cards one by one: minutes, recording, hotel bill. | "In Jersey, a company is only run from Jersey if a quorum of its directors is physically there when the board meets. The minutes record what people claimed. Nobody checks the claim against the boarding passes and hotel bills. I intern at a trust company. This is that check." | 49 |
| 3 | 0:30-0:38 | A caption across the bottom: "Built solo for the Meta Global AI Developer Hackathon, 26 Oct - 4 Nov 2026. All documents synthetic." | "I built all of it during this hackathon. Every document you'll see is synthetic." | 14 |
| 4 | 0:38-0:58 | Click "Open the case". Hold on the NOT MET header and "0 of 3 directors in Jersey". Then a 3-second insert (pre-recorded) of the meeting m10 boarding-pass viewer with the QR code blacked out. Then scroll to the timeline. | "This is a recorded live run. On photos, SAM 3.1 blacks out QR codes first. Then Muse Spark reads every document and quotes the words behind each fact." | 29 |
| 5 | 0:58-1:18 | Click Bruno's chip "recording.wav @39.8s". The viewer opens; play from the cited turn; let 3 seconds of audio play with the highlighted turn visible. | (let 3 seconds of audio play) "Muse Voice Transcribe turned the recording into a roll-call. Bruno: the minutes say St Helier. His own voice says Dubai, and so does his hotel bill." | 26 |
| 6 | 1:18-1:30 | Close the viewer. Hover Chandra's row: "Flight LHR to JER 10:20-11:25". | "Chandra's e-ticket shows her still in the air during the meeting. Alice has only a hotel bill, and a bill alone isn't proof." | 23 |
| 7 | 1:30-1:48 | Scroll to "Rule tests". Highlight "Not met: Quorum of directors physically present in Jersey, Art. 5(3)(b), Law". | "The AI never decides. Tested code applies the article of the law: quorum two, nobody proven present, so this meeting does not meet the test." | 25 |
| 8 | 1:48-2:08 | Highlight the "Second reader: muse-glimmer-30b" line and open "Where the two readings differ". | "Then Meta's open-weight model, Muse Glimmer, reads every document again without seeing the first answer. Here it read Chandra differently, so the case is flagged for a person. Two readers must agree before anything is called evidenced." | 37 |
| 9 | 2:08-2:24 | Scroll to the agent drafts. Click "Approve" on Bruno's minutes correction. Open "Show the agent's tool calls" and point at the rejected ones. | "A Muse Spark agent drafts the follow-up emails. Code checks every tool call, and here it rejected two. Nothing is sent until a person approves." | 24 |
| 10 | 2:24-2:36 | Click "All meetings", then open the rule-pack screen. Highlight Art. 5(3)(b) "the law says" next to "the rule it became" and "Quote verified". | "Give it a new law and Muse Spark writes the rules itself, quoting the statute word for word. Code checks every quote." | 22 |
| 11 | 2:36-2:48 | A full-screen card (make it in any slide tool): "30/30 verdicts on held-out synthetic meetings. 0 dangerous errors. On harder, realistic packs designed by an outside reviewer: 38/45 directors, 1 wrong result. All published." | "On thirty held-out meetings it got every verdict right. On harder packs an outside reviewer designed, it's weaker, and I publish exactly where it fails." | 25 |
| 12 | 2:48-2:52 | Back to the home page: "The minutes say the board met in Jersey. Did it?" and the repository address. | "The minutes say the board met in Jersey. Now you can check." | 12 |

## Notes

- The line the organisers ask for ("what was pre-existing and what you built") is shot 3: nothing pre-existed, and the first commit is on 28 October 2026. Do not say "this week"; say "during this hackathon".
- The hero case has no photo, so SAM 3.1 never visibly fires in it. The 3-second insert in shot 4 comes from meeting m10 (open it, click the boarding-pass chip). Record it separately and cut it in.
- Shots 5 and 8 are where the audience sees Meta's models doing something no plain OCR could: a voice contradicting a minute, and a second model disagreeing. Do not rush them.
- Upload the video to YouTube as Unlisted or Public (the rules do not say which), and open the link while logged out before you submit it.

**15-second clip for X** (sound off, captions burned in, portrait crop): minutes page with "present in St Helier" highlighted (3 s) -> the recording turn "I'm dialing in from my hotel in Dubai" (4 s) -> the Dubai hotel bill (3 s) -> Chandra in the air (3 s) -> NOT MET and "Tested code applies the law" (4 s). Use the X post in `docs/SUBMISSION.md`.
