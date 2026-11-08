/**
 * Trading Strategy Lab — Apps Script backend.
 *
 * Does two things for index.html:
 *  1. fetchTranscript — pulls a YouTube video's caption track server-side
 *     (no CORS restriction applies here, unlike a browser-side fetch).
 *  2. analyzeStrategy — sends the transcript to Claude to extract the
 *     strategy as point-form bullets, draft an MQL5 Expert Advisor, and
 *     suggest take-profit/stop-loss/currency when the video doesn't state
 *     them. This is a drafting aid, not financial advice — see the
 *     disclaimer baked into the prompt below and shown in the UI.
 *
 * One-time setup:
 *  1. script.google.com > New project (or Extensions > Apps Script from a
 *     throwaway Google Sheet). Paste this whole file in.
 *  2. Project Settings (gear icon) > Script Properties > Add property:
 *     key "ANTHROPIC_API_KEY", value = your Claude API key. Never hardcode
 *     the key in this file — reading it from Script Properties keeps it
 *     out of this public repo.
 *  3. Deploy > New deployment > type "Web app".
 *     - Execute as: Me
 *     - Who has access: Anyone
 *     Click Deploy, copy the Web App URL, paste it into index.html's
 *     API_URL constant near the top of its <script>.
 *  4. Whenever you edit this file, make a NEW deployment version (Deploy >
 *     Manage deployments > edit the pencil icon > New version) — editing
 *     the code alone does not update a live Web App URL.
 */

var ANTHROPIC_MODEL = 'claude-sonnet-5-5';

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ ok: false, error: 'Bad request body' });
  }
  try {
    if (body.action === 'fetchTranscript') return respond(fetchTranscript(body.url));
    if (body.action === 'analyzeStrategy') return respond(analyzeStrategy(body.transcript, body.url));
    return respond({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function extractVideoId(url) {
  var m = String(url || '').match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Fetches a YouTube video's transcript the same way the popular
 * youtube-transcript-api Python library does: load the watch page, pull
 * the caption track list out of its embedded player config, then fetch
 * the chosen track's own timedtext URL and strip it down to plain text.
 * This is an unofficial method (no public YouTube API exposes transcript
 * text directly) — it can break if YouTube changes its page markup, and
 * only works for videos that have captions (manual or auto-generated) at
 * all. If it fails, index.html's "paste transcript manually" box still
 * works as a fallback.
 */
function fetchTranscript(url) {
  var videoId = extractVideoId(url);
  if (!videoId) return { ok: false, error: 'Could not find a YouTube video ID in that URL.' };

  var pageResp = UrlFetchApp.fetch('https://www.youtube.com/watch?v=' + videoId, {
    muteHttpExceptions: true,
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  var html = pageResp.getContentText();

  var title = '';
  var titleMatch = html.match(/<title>([^<]*)<\/title>/);
  if (titleMatch) title = titleMatch[1].replace(/ - YouTube$/, '');

  var tracksMatch = html.match(/"captionTracks":(\[[^\]]*\])/);
  if (!tracksMatch) {
    return { ok: false, error: 'No captions/transcript found for this video. Paste the transcript manually instead.', title: title };
  }

  var tracks;
  try {
    tracks = JSON.parse(tracksMatch[1].replace(/\\u0026/g, '&'));
  } catch (err) {
    return { ok: false, error: 'Could not read the caption track list for this video.', title: title };
  }

  var track = tracks.filter(function (t) { return (t.languageCode || '').indexOf('en') === 0; })[0] || tracks[0];
  if (!track || !track.baseUrl) {
    return { ok: false, error: 'No usable caption track found for this video.', title: title };
  }

  var capResp = UrlFetchApp.fetch(track.baseUrl, { muteHttpExceptions: true });
  var xml = capResp.getContentText();
  var text = xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return { ok: false, error: 'Transcript came back empty. Paste it manually instead.', title: title };
  return { ok: true, transcript: text, title: title };
}

/**
 * Sends the transcript to Claude to extract the strategy as point-form
 * bullets, write a starter MQL5 Expert Advisor, and suggest take-profit/
 * stop-loss/currency pair when the video doesn't state them explicitly.
 */
function analyzeStrategy(transcript, sourceUrl) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return { ok: false, error: 'Server is missing its ANTHROPIC_API_KEY script property — see this file\'s setup comment.' };
  if (!transcript || transcript.trim().length < 30) {
    return { ok: false, error: 'Transcript is too short to analyze.' };
  }

  var prompt = 'You are analyzing a trading-strategy video transcript to help a trader draft (NOT execute) '
    + 'a strategy for backtesting. This is research tooling only — never present this as financial advice.\n\n'
    + 'Transcript:\n"""\n' + transcript.slice(0, 15000) + '\n"""\n\n'
    + 'Respond with ONLY a JSON object (no markdown fences, no commentary) with exactly these keys:\n'
    + '{\n'
    + '  "pointForm": ["..."],\n'
    + '  "mt5Code": "...",\n'
    + '  "recommendation": { "currency": "...", "stopLoss": "...", "takeProfit": "...", "rationale": "..." }\n'
    + '}\n\n'
    + 'Rules for each field:\n'
    + '- pointForm: the strategy as clear, standalone bullet points covering market/symbol, timeframe, '
    + 'indicators + settings, entry rule, exit rule, risk/position sizing, and trading session — one bullet '
    + 'per fact. Use "Not specified" for any fact the transcript never gives.\n'
    + '- mt5Code: a complete MQL5 Expert Advisor (.mq5) implementing the strategy as closely as the '
    + 'transcript supports, with OnInit/OnTick/OnDeinit and basic trade-management scaffolding (CTrade or '
    + 'OrderSend). Add //TODO comments anywhere the transcript was ambiguous instead of guessing silently.\n'
    + '- recommendation.currency: a specific symbol (e.g. "EURUSD") — from the transcript if stated, '
    + 'otherwise your best general-purpose suggestion for this strategy type.\n'
    + '- recommendation.stopLoss / takeProfit: concrete values (e.g. "20 pips", "1.5x ATR(14)", "40 pips '
    + '(2:1 reward:risk)") — from the transcript if stated, else a sensible default for this strategy type.\n'
    + '- recommendation.rationale: 1-2 sentences explaining the choices above, clearly noting anything that '
    + 'was inferred rather than stated in the video.';

  var payload = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  };

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = resp.getResponseCode();
  if (code !== 200) {
    return { ok: false, error: 'Claude API error (' + code + '): ' + resp.getContentText().slice(0, 300) };
  }

  var data = JSON.parse(resp.getContentText());
  var text = (data.content && data.content[0] && data.content[0].text) || '';
  var jsonText = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();

  var parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, error: 'Could not parse Claude\'s response as JSON.', raw: text.slice(0, 500) };
  }

  return {
    ok: true,
    pointForm: parsed.pointForm || [],
    mt5Code: parsed.mt5Code || '',
    recommendation: parsed.recommendation || {},
    sourceUrl: sourceUrl || '',
  };
}
