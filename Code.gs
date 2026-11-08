/**
 * Trading Strategy Lab — Apps Script backend.
 *
 * Does four things for index.html:
 *  1. fetchTranscript — asks Gemini (Google's free-tier LLM) to watch the
 *     YouTube video directly by URL and transcribe what's said. Needs a
 *     free Gemini API key (see setup below) but no payment — unlike
 *     Claude/OpenAI, Gemini's free tier needs no billing on file. This
 *     replaced an earlier version that scraped YouTube's caption-track
 *     markup directly (no AI, no key) — that method broke for videos
 *     whose caption data isn't exposed in a detectable form; asking
 *     Gemini to watch the video is far more reliable across videos.
 *  2. summarizeTranscript — asks Gemini to summarize whatever transcript
 *     text is currently in the page (fetched above or pasted manually)
 *     into a short plain-text paragraph. Same GEMINI_API_KEY as above.
 *  3. aiKeyNotes — asks Gemini for one key note per aspect of the
 *     strategy (market, timeframe, indicators, entries, exit, stop,
 *     risk, etc. — the same 12 aspects as the editable fields below it)
 *     as a read-only cross-check before filling those fields in by hand.
 *  4. exportToSheet — appends one row (video link, title, strategy name,
 *     every extracted field, notes, AI summary) to a Google Sheet in
 *     your own Drive — the sheet is created automatically on first use
 *     and its ID is remembered in this script's own properties, so every
 *     export after that lands in the same sheet. Free, no AI involved.
 *
 * One-time setup:
 *  1. script.google.com > New project (or Extensions > Apps Script from a
 *     throwaway Google Sheet). Paste this whole file in.
 *  2. Get a free Gemini API key: aistudio.google.com/apikey (uses your
 *     Google account, no payment method required for the free tier).
 *  3. Project Settings (gear icon) > Script Properties > Add property:
 *     key "GEMINI_API_KEY", value = that key. Never hardcode the key in
 *     this file — reading it from Script Properties keeps it out of
 *     this public repo.
 *  4. Deploy > New deployment > type "Web app".
 *     - Execute as: Me
 *     - Who has access: Anyone
 *     Click Deploy, copy the Web App URL, paste it into index.html's
 *     API_URL constant near the top of its <script>.
 *  5. Whenever you edit this file, make a NEW deployment version (Deploy >
 *     Manage deployments > edit the pencil icon > New version) — editing
 *     the code alone does not update a live Web App URL.
 */

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ ok: false, error: 'Bad request body' });
  }
  try {
    if (body.action === 'fetchTranscript') return respond(fetchTranscript(body.url));
    if (body.action === 'summarizeTranscript') return respond(summarizeTranscript(body.transcript));
    if (body.action === 'aiKeyNotes') return respond(aiKeyNotes(body.transcript));
    if (body.action === 'exportToSheet') return respond(exportToSheet(body));
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

var GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * Fetches this video's page <title> only (cheap, no AI needed) — purely
 * cosmetic, used for the Sheet export's "Video title" column.
 */
function fetchVideoTitle(videoId) {
  try {
    var pageResp = UrlFetchApp.fetch('https://www.youtube.com/watch?v=' + videoId, {
      muteHttpExceptions: true,
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    var html = pageResp.getContentText();
    var titleMatch = html.match(/<title>([^<]*)<\/title>/);
    return titleMatch ? titleMatch[1].replace(/ - YouTube$/, '') : '';
  } catch (err) {
    return '';
  }
}

/**
 * Asks Gemini to watch the YouTube video directly (passed by URL, not
 * downloaded) and transcribe what's said. Far more reliable across
 * videos than scraping YouTube's own caption markup, since it doesn't
 * depend on a caption track being exposed in a detectable form at all —
 * Gemini transcribes the spoken audio itself. Needs a free Gemini API
 * key (see this file's top comment for setup) stored as the
 * GEMINI_API_KEY script property.
 */
function fetchTranscript(url) {
  var videoId = extractVideoId(url);
  if (!videoId) return { ok: false, error: 'Could not find a YouTube video ID in that URL.' };

  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok: false, error: 'Server is missing its GEMINI_API_KEY script property — see this file\'s setup comment.' };

  var title = fetchVideoTitle(videoId);

  var payload = {
    contents: [{
      parts: [
        { fileData: { fileUri: 'https://www.youtube.com/watch?v=' + videoId } },
        { text: 'Transcribe everything spoken in this video, as plain text, as accurately as you can. '
          + 'Do not summarize or add commentary — just the verbatim spoken words in order.' },
      ],
    }],
  };

  var resp = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }
  );

  var code = resp.getResponseCode();
  if (code !== 200) {
    return { ok: false, error: 'Gemini API error (' + code + '): ' + resp.getContentText().slice(0, 300), title: title };
  }

  var data = JSON.parse(resp.getContentText());
  var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  var text = (parts && parts.map(function (p) { return p.text || ''; }).join('')) || '';
  text = text.trim();

  if (!text) return { ok: false, error: 'Gemini returned no transcript for this video. Paste it manually instead.', title: title };
  return { ok: true, transcript: text, title: title };
}

/**
 * Asks Gemini to summarize whatever transcript text is already in the
 * page's textarea (pasted manually or fetched above) — plain text
 * summary, not structured fields. Only needs GEMINI_API_KEY, same as
 * fetchTranscript, and only ever sends the text itself, not the video.
 */
function summarizeTranscript(transcript) {
  if (!transcript || transcript.trim().length < 30) {
    return { ok: false, error: 'Transcript is too short to summarize.' };
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok: false, error: 'Server is missing its GEMINI_API_KEY script property — see this file\'s setup comment.' };

  var payload = {
    contents: [{
      parts: [
        { text: 'Summarize ONLY the trading strategy described in the following video transcript, in a short, '
          + 'clear paragraph (4-6 sentences). Focus specifically on the strategy itself — the market/symbol it '
          + 'trades, the timeframe, the indicators or setup used, and the entry/exit/risk logic — rather than a '
          + 'general recap of the video (skip intros, sponsor mentions, unrelated commentary, etc.). Plain text '
          + 'only, no markdown, no headings.\n\n'
          + 'Transcript:\n"""\n' + transcript.slice(0, 20000) + '\n"""' },
      ],
    }],
  };

  var resp = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }
  );

  var code = resp.getResponseCode();
  if (code !== 200) {
    return { ok: false, error: 'Gemini API error (' + code + '): ' + resp.getContentText().slice(0, 300) };
  }

  var data = JSON.parse(resp.getContentText());
  var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  var text = (parts && parts.map(function (p) { return p.text || ''; }).join('')) || '';
  text = text.trim();

  if (!text) return { ok: false, error: 'Gemini returned no summary.' };
  return { ok: true, summary: text };
}

// Must stay in the same order as index.html's own `defs` array — this is
// what turns the saved `fields` object into Sheet columns, and is also
// the set of aspects aiKeyNotes below asks Gemini to cover one by one.
var FIELD_ORDER = [
  ['market', 'Market / symbol'],
  ['timeframe', 'Timeframe'],
  ['indicators', 'Indicators & settings'],
  ['entryLong', 'Entry — buy/long'],
  ['entryShort', 'Entry — sell/short'],
  ['exit', 'Exit / take-profit'],
  ['stop', 'Stop-loss'],
  ['trailing', 'Trailing stop / breakeven'],
  ['risk', 'Position size / risk'],
  ['tradeMgmt', 'Trade management'],
  ['session', 'Session / time filter'],
  ['filters', 'Additional filters'],
];

/**
 * Asks Gemini to write one short key note per aspect of the strategy
 * (the same 12 aspects as FIELD_ORDER/index.html's `defs` — market,
 * timeframe, indicators, entries, exit, stop, etc.), as a single JSON
 * object keyed by the same field ids. This is a read-only AI pass shown
 * above the editable fields in "Review your strategy" — it doesn't fill
 * those fields itself, it's there so you can cross-check them.
 */
function aiKeyNotes(transcript) {
  if (!transcript || transcript.trim().length < 30) {
    return { ok: false, error: 'Transcript is too short to analyze.' };
  }

  var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { ok: false, error: 'Server is missing its GEMINI_API_KEY script property — see this file\'s setup comment.' };

  var aspectList = FIELD_ORDER.map(function (f) { return '"' + f[0] + '" (' + f[1] + ')'; }).join(', ');
  var jsonShape = '{ ' + FIELD_ORDER.map(function (f) { return '"' + f[0] + '": "..."'; }).join(', ') + ' }';

  var payload = {
    contents: [{
      parts: [
        { text: 'Read the following trading video transcript and write one concise key note (1-2 sentences) '
          + 'for EACH of these aspects: ' + aspectList + '. If the transcript does not mention a given aspect '
          + 'at all, use the exact string "Not mentioned" for that one instead of guessing.\n\n'
          + 'Respond with ONLY a JSON object (no markdown fences, no commentary) shaped exactly like this, '
          + 'using these exact keys: ' + jsonShape + '\n\n'
          + 'Transcript:\n"""\n' + transcript.slice(0, 20000) + '\n"""' },
      ],
    }],
  };

  var resp = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }
  );

  var code = resp.getResponseCode();
  if (code !== 200) {
    return { ok: false, error: 'Gemini API error (' + code + '): ' + resp.getContentText().slice(0, 300) };
  }

  var data = JSON.parse(resp.getContentText());
  var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  var text = (parts && parts.map(function (p) { return p.text || ''; }).join('')) || '';
  var jsonText = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();

  var notes;
  try {
    notes = JSON.parse(jsonText);
  } catch (err) {
    return { ok: false, error: 'Could not parse Gemini\'s response as JSON.', raw: text.slice(0, 500) };
  }

  return { ok: true, notes: notes };
}

var SHEET_NAME = 'Strategies';

/**
 * Finds (or creates, on first use) a spreadsheet in your Drive to hold
 * every exported strategy, remembering its ID in this script's own
 * properties so later exports reuse the same sheet instead of making a
 * new one each time.
 */
function getOrCreateSheet() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('SHEET_ID');
  var ss;
  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch (err) {
      ss = null; // sheet was deleted/moved — fall through and make a new one
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Trading Strategy Lab — Exports');
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(SHEET_NAME);
    var header = ['Exported at', 'Video URL', 'Video title', 'Strategy name']
      .concat(FIELD_ORDER.map(function (f) { return f[1]; }))
      .concat(['Notes', 'AI Summary']);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Appends one row for a single strategy export — video link/title,
 * strategy name, every extracted field (in FIELD_ORDER), and the notes
 * field — to the Sheet from getOrCreateSheet().
 */
function exportToSheet(body) {
  var sheet = getOrCreateSheet();
  var fields = body.fields || {};
  var row = [new Date(), body.url || '', body.title || '', body.name || 'Untitled strategy']
    .concat(FIELD_ORDER.map(function (f) { return fields[f[0]] || ''; }))
    .concat([body.notes || '', body.summary || '']);
  sheet.appendRow(row);
  return { ok: true, sheetUrl: sheet.getParent().getUrl() };
}
