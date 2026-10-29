# Daily review (instructions for Claude)

Run once a day, after the GitHub Actions job (06:30 Malaysia time) has collected data and the engine has traded.
The engine follows the rules mechanically. Your job is the judgement layer: explain what happened, check whether
the strategy is working, and amend a rule only when the evidence supports it.

## Steps

1. In this project folder, run `npm run review:context` and read the whole briefing.
   - The engine dates its runs in UTC, so at 8:00 am Malaysia time the latest run is normally yesterday's UTC date.
     If the briefing shows a WARNING that the latest run is older than that, the daily job may have failed: say so
     in the review and don't change any rules.
   - If a review already exists for the latest engine run, `review:apply` skips it. That's expected on a re-run.
2. For each portfolio (balanced, aggressive), write a journal entry of 120 to 300 words, in plain English:
   - **What happened today:** trades and exits, and the reason for each, in your own words.
   - **Scorecard:** return since start against hold BTC, hold VOO and 50/50, with the actual numbers from the briefing.
   - **What's working and what isn't:** which holdings or rules are helping or hurting, and why.
   - **What to watch:** upcoming macro events, positions near a stop, signals that could flip.
   - **Rule changes:** none, or the change and the evidence for it.
3. Rule changes should be rare. Change a rule only when there is a pattern over several days, not one bad day.
   Examples: a stop-loss that keeps cutting positions just before they recover, or a market that has been stuck
   in "Avoid" for weeks while its target share sits idle in cash. Stay within the limits in the briefing.
   Never change fees, board lots or leverage.
4. Write the result as JSON to a temporary file, for example `%TEMP%/review.json`:

   ```json
   {
     "entries": [
       { "portfolioId": "balanced", "summary": "…", "ruleChanges": [] },
       { "portfolioId": "aggressive", "summary": "…", "ruleChanges": [{ "rule": "stopLoss", "to": 0.18, "why": "…" }] }
     ]
   }
   ```

   Allowed `rule` values: `maxPosition`, `maxSmallAlt`, `stopLoss`, `driftBand`, `trailingStop` (number or null),
   `targetMix` (`{ "crypto", "us", "my", "cash" }`, summing to 1).
5. Run `npm run review:apply -- <file>`. It saves the entries and applies only the changes that pass the
   guardrails. Rejected changes are recorded in the journal entry.
6. Reply with a three-line summary: each portfolio's value and return, and any rule change.

## Rules of conduct

- Use only numbers from the briefing. Never invent prices, events or news.
- This is a paper simulation for learning, not financial advice. Write it that way.
- Don't edit code, commit or push as part of the review.
