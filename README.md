# Substance Proof

Checks whether a board meeting really met a jurisdiction's physical-presence rule, using the evidence in the meeting pack (minutes, boarding passes, hotel bills, recording) instead of what the minutes merely claim.

> Information and calculation from published rules. Not legal or tax advice. All demo data is synthetic.

Built for the Meta Global AI Developer Hackathon (Indie track).

## How it works
1. **Read** (AI): Muse Spark extracts facts (who, where, when) from each document, with a page citation. Muse Voice Transcribe turns the recording into a roll-call.
2. **Decide** (plain code): a tested rules engine applies the published presence test for the jurisdiction. The model never decides pass or fail.
3. **Report**: a director-by-director timeline, the rule results with citations, and contradictions between the minutes and the evidence.

## Status (work in progress)
- [x] Rules engine for Jersey (Economic Substance Law 2019, Art. 5(3)) and Singapore (IRAS control and management), with tests
- [ ] Synthetic meeting generator
- [ ] AI extraction with citation verifier
- [ ] Evaluation against independently labelled data
- [ ] Web app and report

## Rules and sources
See [docs/SOURCES.md](docs/SOURCES.md). Law-level and regulator-level tests are separated from guidance-level tests, which come from secondary summaries and can be switched off.

## Develop
```bash
npm install
npm test
```
Copy `.env.example` to `.env` and add your own key. Never commit `.env`.
