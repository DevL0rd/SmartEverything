---
name: smarteverything-research
description: "Researches a question that needs evidence from outside the home: weighs papers, official documents, documentation and real user reports, and returns a briefing the person can discuss, with follow-ups kept in the same helper. Use it for medical, physics and technical questions, product buying, Thai market checks and device faults. Not for a fact the home's own tools already hold (smarteverything-home, smarteverything-health) or for writing code (smarteverything-coding-process)."
---

# Research and evidence

A lookup is not research: a device state, a health total or a stored price is one read away, so answer it directly. Research is a question the home cannot answer from its own data, and it goes to a helper.

## Delegate and brief

- Give the helper the person's question in their words, why they ask, what is already known, and the source order below. Research that feeds a plan is still research.
- Keep one helper per topic and send follow-ups to it, so the person can keep asking questions the first round did not cover. Use `subagent` with `send_message` in this harness, or `subagent_run` with `chat_send` in a helper chat.
- Return a briefing the person can argue with: the bottom line first, then findings with a link and a date each, then what is uncertain, then what to check next. Name the strongest source behind every claim, and say which claims rest on one report.

## Weigh sources

- Primary beats secondary: papers, standards, specifications, release notes, official documentation and filings over reporting, blogs and affiliate rankings.
- Say what you actually read. An abstract is not the paper, a search snippet is not the page, and a paywall is a gap to report rather than paper over.
- Sources that disagree are reported side by side with the stronger one named and the reason; blending them into one answer invents a finding.
- Mark findings established, likely or anecdotal. No evidence is an answer: say nothing was found instead of filling the gap.
- Carry dates. Prices, firmware and behaviour tied to a version go stale in about 18 months, so say when a source was written.

## Kinds of question

Medical, physics and other sciences: systematic reviews, clinical guidelines and trials over articles. Check sample size, humans against animals or cells, effect size beside significance, funding, replication and retraction. A paper is a finding, not a diagnosis or a dose: give what it shows and what it leaves open, and point medical decisions to the person's own clinician.

Products: maker pages only for the specification, because they say what the product claims rather than what it does. Weight owners reporting after months, warranty and repair threads, and patterns of the same failure, over launch-day praise, sponsored videos and affiliate lists; say when a review looks paid for or incentivised.

Thai market: search in Thai as well as English. Pantip carries what buyers and owners report, warnings included; the Thai FDA and the consumer protection board cover food, cosmetics, supplements and complaints. Give prices in baht, say whether an importer is official or grey, and check the Thai warranty, service centre, spare parts, and 220 V 50 Hz with plug type.

Devices and faults: the maker's manual, release notes and known-issues page first, then what owners did that worked. Pin the model, firmware, region and app version, say when a fix belongs to an older version, and mark any fix nobody confirmed.

## Report

Link each claim, quote figures as found, convert to the home's currency and units, and answer the question asked rather than a wider one. Name what you could not reach. Attach a widget only when the briefing contains a chart or the thing itself.
