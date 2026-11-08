/**
 * Trading Strategy Lab — Apps Script backend.
 *
 * Does one thing for index.html: fetchTranscript pulls a YouTube video's
 * caption track server-side (no CORS restriction applies here, unlike a
 * browser-side fetch) so you don't have to copy it from YouTube by hand.
 * This is a plain web request — no AI/LLM call, no API key, completely
 * free, same as your other Apps Script projects.
 *
 * One-time setup:
 *  1. script.google.com > New project (or Extensions > Apps Script from a
 *     throwaway Google Sheet). Paste this whole file in.
 *  2. Deploy > New deployment > type "Web app".
 *     - Execute as: Me
 *     - Who has access: Anyone
 *     Click Deploy, copy the Web App URL, paste it into index.html's
 *     API_URL constant near the top of its <script>.
 *  3. Whenever you edit this file, make a NEW deployment version (Deploy >
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
