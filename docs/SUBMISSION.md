# Submission texts (copy and paste)

## Project name
Substance Proof

## One-line description
Checks whether a board meeting really met the physical-presence rule for its jurisdiction, from the evidence in the meeting pack, with every finding cited to a page or a second of the recording.

## Description (about 200 words)
Economic-substance and tax-residence rules require directors to be physically present where the board meets. Jersey's Economic Substance Law (Art. 5(3)) needs a quorum physically in Jersey, with penalties up to £100,000. Singapore's IRAS has a similar 50%-or-chairman test for virtual meetings. Today a company secretary checks this by hand, and minutes only record what people claimed.

Substance Proof reads the whole meeting pack. Muse Spark extracts who was where and when from minutes, boarding passes, e-tickets, phone photos, scans and hotel bills, quoting the words behind each fact. Muse Voice Transcribe turns the recording into a roll-call, and Muse Spark finds who said where they were joining from, to the second. A deterministic, unit-tested rules engine (not the AI) applies the published test and flags where the minutes contradict the evidence or the recording. An approval-gated agent using Muse Spark function calling drafts evidence requests and minutes corrections; every tool call is validated by code and nothing is sent without approval.

On 30 held-out synthetic meetings it read 166/166 facts and reached 30/30 correct verdicts. On a hostile stress set it read 86% of facts with zero dangerous errors: it falls back to "review", never a false pass.

## Meta tooling used
Muse Spark 1.3 (vision, PDF, strict JSON-schema output, transcript reasoning, function-calling agent); Muse Voice Transcribe 1.0 (diarization, keyword hints).

## Track and theme
Indie Developer · Build for Your World

## Links
- Repository: https://github.com/bsjuilla/substance-proof
- Live demo (recorded real runs): https://bsjuilla.github.io/substance-proof/
- Video: (paste your video link)

## X post (for Most Viral; attach the 15-second clip)
The minutes said all 3 directors met in Jersey.
The hotel bill and the meeting recording said one was in Dubai.
The e-ticket said another was still in the air.

I built Substance Proof for the #MetaAIHackathon: Muse Spark reads the evidence, tested code applies the law, and every finding cites the page or the second. 🧾✈️

github.com/bsjuilla/substance-proof
