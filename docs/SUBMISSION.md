# Submission texts (copy and paste)

## Project name
Substance Proof

## One-line description
Checks whether a board meeting really met the physical-presence rule for its jurisdiction, from the evidence in the meeting pack, with every finding cited to a page or a second of the recording.

## Description (about 200 words)
Tax-residence and economic-substance rules depend on where directors physically are when the board meets. Under Jersey's Economic Substance Law, a company is directed and managed in Jersey if, among other conditions, a quorum of directors is physically present in Jersey at its board meetings (Art. 5(3)); failing the substance test can mean fines of £10,000, then up to £100,000. Singapore's IRAS uses a 50%-or-chairman indicator for virtual meetings. Today a company secretary checks this by hand, and the minutes only record what people claimed.

Substance Proof reads the whole meeting pack. Muse Spark extracts who was where and when from minutes, boarding passes, e-tickets, phone photos, scans and hotel bills, quoting the words behind each fact. Muse Voice Transcribe turns the recording into a roll-call. A deterministic, unit-tested rules engine (not the AI) applies the published test and flags where the minutes contradict the evidence. An approval-gated Muse Spark agent drafts evidence requests and minutes corrections; code checks every tool call and nothing is sent without approval. Given the full text of a law, Muse Spark also writes the rules as data, quoting the law; code verifies every quote.

On 30 held-out synthetic meetings, scored against an independent answer key: 30/30 verdicts, 165/166 facts, zero dangerous errors.

## Meta tooling used
Muse Spark 1.3 (vision, PDF, strict JSON-schema output, transcript reasoning, a stateless function-calling agent, writing rules from a statute); Muse Voice Transcribe 1.0 (diarization, keyword hints, recordings of any length); SAM 3.1 (finds QR codes, barcodes, faces and signatures on photos so they are blacked out before reading).

## Track and theme
Indie Developer · Build for Your World

## Links
- Repository: https://github.com/bsjuilla/substance-proof
- Live demo (recorded real runs, no key needed): https://bsjuilla.github.io/substance-proof/
- Video: (paste your video link)

## X post (for Most Viral; attach the 15-second clip)
The minutes said all 3 directors met in Jersey.
The hotel bill and the meeting recording said one was in Dubai.
The e-ticket said another was still in the air.

I built Substance Proof for the #MetaHackathon: Muse Spark reads the evidence, tested code applies the law, and every finding cites the page or the second. (Synthetic demo documents.)

github.com/bsjuilla/substance-proof
