# Trading Analysis

A website to extract trading rules from YouTube video transcripts
and backtest confirmed strategies using historical market data.

## Current features

- YouTube video preview + transcript input (auto-fetch via the backend,
  or paste manually)
- Quick local draft: free, offline, keyword-based extraction into
  editable entry/exit/stop-loss/take-profit/etc. fields
- AI analysis (optional, needs the `Code.gs` backend below): extracts the
  strategy as point-form bullets, drafts an MQL5 Expert Advisor, and
  recommends take-profit / stop-loss / currency pair
- Save/export/import a strategy library (stored in the browser)

## Backend setup (`Code.gs`) — optional, enables auto-fetch + AI analysis

1. script.google.com → New project (or Extensions > Apps Script from a
   throwaway Google Sheet). Paste `Code.gs`'s contents in.
2. Project Settings → Script Properties → add `ANTHROPIC_API_KEY` with
   your Claude API key as the value.
3. Deploy → New deployment → type "Web app" → Execute as: Me, Who has
   access: Anyone. Copy the Web App URL.
4. Paste that URL into `index.html`'s `API_URL` constant (near the top of
   its `<script>`).
5. Re-deploy a new version whenever `Code.gs` changes (editing the code
   alone doesn't update a live Web App URL).

Without this backend, the site still works using the "Quick local draft"
button and manually-pasted transcripts.

## Planned features

- Historical price CSV upload from MT5
- Backtesting with spread, commission and slippage
- Trade history, equity chart and performance statistics
- Save backtest results alongside each strategy
