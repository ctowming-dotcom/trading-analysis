# Trading Analysis

A website to extract trading rules from YouTube video transcripts, as a
spec you build the MT5 Expert Advisor from yourself — and eventually
backtest confirmed strategies using historical market data.

Free to run — no payment needed, just your own Google account and a free
Gemini API key for the optional backend below.

## Current features

- YouTube video preview + transcript input — auto-fetch via the optional
  backend (asks Gemini to watch the video and transcribe it directly, far
  more reliable than scraping YouTube's own caption markup), or paste
  manually using YouTube's own "Show transcript"
- Keyword-based extraction into 12 editable fields covering everything
  needed to build an EA by hand: market/symbol, timeframe, indicators &
  settings, entry rules (long and short kept separate), exit/take-profit,
  stop-loss, trailing stop/breakeven, position size/risk, trade
  management (max positions/pyramiding), trading session/time filter, and
  additional filters/confirmations
- Save/export/import a strategy library (stored in the browser)
- "Export to Google Sheet" — sends the video link, title, strategy name,
  every extracted field and the notes to a Google Sheet in your own
  Drive (needs the backend below; the sheet is created automatically the
  first time you use it)

## Backend setup (`Code.gs`) — optional, enables auto-fetch + the Sheet export

1. script.google.com → New project (or Extensions > Apps Script from a
   throwaway Google Sheet). Paste `Code.gs`'s contents in.
2. Get a free Gemini API key: aistudio.google.com/apikey (uses your
   Google account — no payment method required for the free tier).
3. Project Settings → Script Properties → add `GEMINI_API_KEY` with that
   key as the value.
4. Deploy → New deployment → type "Web app" → Execute as: Me, Who has
   access: Anyone. Copy the Web App URL.
5. Paste that URL into `index.html`'s `API_URL` constant (near the top of
   its `<script>`).
6. Re-deploy a new version whenever `Code.gs` changes (editing the code
   alone doesn't update a live Web App URL) — this applies the next time
   you add a feature.

Without this backend, the site still works — paste the transcript
yourself and click "Extract strategy draft"; "Export strategy" (as a
`.json` file) still works too, just not "Export to Google Sheet".

`exportToSheet` itself is a plain write, no AI involved — only
`fetchTranscript` calls Gemini.

## Planned features

- Historical price CSV upload from MT5
- Backtesting with spread, commission and slippage
- Trade history, equity chart and performance statistics
- Save backtest results alongside each strategy
