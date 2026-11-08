# Trading Analysis

A website to extract trading rules from YouTube video transcripts, as a
spec you build the MT5 Expert Advisor from yourself — and eventually
backtest confirmed strategies using historical market data.

Entirely free to run — no AI/LLM API, no payment, no account needed
beyond your own Google account for the optional backend below.

## Current features

- YouTube video preview + transcript input (auto-fetch via the optional
  backend, or paste manually using YouTube's own "Show transcript")
- Keyword-based extraction into 12 editable fields covering everything
  needed to build an EA by hand: market/symbol, timeframe, indicators &
  settings, entry rules (long and short kept separate), exit/take-profit,
  stop-loss, trailing stop/breakeven, position size/risk, trade
  management (max positions/pyramiding), trading session/time filter, and
  additional filters/confirmations
- Save/export/import a strategy library (stored in the browser)

## Backend setup (`Code.gs`) — optional, enables "Fetch transcript automatically"

This is a plain web request (no AI, no API key, no cost) — it just saves
you copying the transcript from YouTube by hand.

1. script.google.com → New project (or Extensions > Apps Script from a
   throwaway Google Sheet). Paste `Code.gs`'s contents in.
2. Deploy → New deployment → type "Web app" → Execute as: Me, Who has
   access: Anyone. Copy the Web App URL.
3. Paste that URL into `index.html`'s `API_URL` constant (near the top of
   its `<script>`).
4. Re-deploy a new version whenever `Code.gs` changes (editing the code
   alone doesn't update a live Web App URL).

Without this backend, the site still works — paste the transcript
yourself and click "Extract strategy draft".

## Planned features

- Historical price CSV upload from MT5
- Backtesting with spread, commission and slippage
- Trade history, equity chart and performance statistics
- Save backtest results alongside each strategy
