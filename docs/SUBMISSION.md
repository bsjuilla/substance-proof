# Submission texts (copy and paste)

## Project name
Substance Proof

## One-line description
Checks whether a board meeting really met the physical-presence rule for its jurisdiction, from the evidence in the meeting pack, with every finding cited to a page or a second of the recording.

## Description (about 200 words)
Tax-residence and economic-substance rules depend on where directors physically are when the board meets. Under Jersey's Economic Substance Law, a company is directed and managed in Jersey if, among other conditions, a quorum of directors is physically present in Jersey at its board meetings (Art. 5(3)); failing the substance test can mean fines of £10,000, then up to £100,000. Singapore's IRAS uses a 50%-or-chairman indicator for virtual meetings. Today a company secretary checks this by hand, and the minutes only record what people claimed. It is built for whoever has to rely on minutes they did not write: an auditor, a tax adviser, a buyer's due-diligence team, or the compliance officer of a trust company.

Substance Proof reads the whole meeting pack. SAM 3.1 finds QR codes (and looks for faces and signatures) in photos and blacks them out before Muse Spark extracts who was where and when from minutes, boarding passes, e-tickets, phone photos, scans and hotel bills, quoting the words behind each fact. Muse Voice Transcribe turns the recording into a roll-call. A deterministic, unit-tested rules engine (not the AI) applies the published test and flags where the minutes contradict the evidence. Muse Glimmer, Meta's open-weight model, independently re-reads every document; if its reading would change the answer, the meeting goes to a person. An approval-gated Muse Spark agent drafts evidence requests and minutes corrections; code checks every tool call and nothing is sent without approval. Given the full text of a law, Muse Spark also writes the rules as data, quoting the law; code verifies every quote.

On 30 held-out synthetic meetings, scored against an independent answer key: 30/30 verdicts, 166/166 facts, zero dangerous errors. Four outside AI reviews attacked it, the last with the live models on 16 realistic meetings it designed: that review raised directors placed correctly from 24/45 to 38/45 after the fixes, and closed an injection hidden in a picture that had faked two directors' presence. The README reports what is still wrong, including one wrong result on the realistic set and that a capable chatbot ties it on clean synthetic packs.

## Meta tooling used
Muse Spark 1.3 (vision, PDF, strict JSON-schema output, transcript reasoning, a stateless function-calling agent, writing rules from a statute); Muse Voice Transcribe 1.0 (diarization, keyword hints, recordings of any length); SAM 3.1 (finds QR codes, barcodes, faces and signatures on photos so they are blacked out before reading); Muse Glimmer 30B, Meta's open-weight model (an independent second reader: it re-reads every document from scratch, code decides the meeting again from its reading, and any change in the answer sends the meeting to review).

## Track and theme
Indie Developer · Build for Your World

## Links
- Repository: https://github.com/bsjuilla/substance-proof
- Live demo (recorded real runs, no key needed): https://bsjuilla.github.io/substance-proof/
- Video: (paste your video link)

## X post (for Most Viral; attach the 15-second clip)
There is no official hashtag in the rules or on the event pages. Participants use #MetaAIHackathon about twice as often as #MetaHackathon, so use that one, once. Post this text (it is under 280 characters; the link counts as 23):

```
The minutes said all 3 directors met in Jersey.
The recording put one in Dubai. The e-ticket put another in the air.

Substance Proof, my #MetaAIHackathon build: Meta's Muse models read the evidence; tested code applies the law.

Synthetic demo docs.
github.com/bsjuilla/substance-proof
```

Then reply to your own post with these, one at a time:
1. How it works: SAM 3.1 blacks out QR codes on photos first, before the reader sees them. Muse Spark reads every PDF and photo and quotes the words behind each fact. Muse Voice Transcribe turns the recording into a timed roll-call. Code, not the model, applies the law.
2. Then Muse Glimmer, Meta's open-weight model, re-reads every document without seeing the first answer. If its reading would change the result, a person looks. Two readers must agree before anything is called EVIDENCED.
3. I let another AI attack it as a judge, a buyer and a fraudster, then with live models on 16 realistic packs. Directors placed correctly went from 24/45 to 38/45; one wrong result is still open, and it's in the README.
4. Built solo for #MetaAIHackathon by an accounting student in Mauritius. Repo and key-free demo: github.com/bsjuilla/substance-proof

Do not ask anyone to repost or vote, and do not post near-identical copies: only the submitted post counts.
