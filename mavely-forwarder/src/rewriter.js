import { URL } from 'node:url';

export function extractUrls(text) {
  if (!text) return [];
  const regex = /https?:\/\/\S+/g;
  return text.match(regex) || [];
}

export function rewriteMavelyCanonicalLink(urlString, myId) {
  try {
    const url = new URL(urlString);
    const qp = url.searchParams;

    // sharedid
    if (myId) qp.set('sharedid', myId);

    // subId1: URL-encoded JSON with keys s and meta.userId
    const raw = qp.get('subId1');
    if (raw) {
      try {
        const decoded = decodeURIComponent(raw);
        const obj = JSON.parse(decoded);
        obj.s = myId || obj.s;
        if (obj.meta && typeof obj.meta === 'object') {
          obj.meta.userId = myId || obj.meta.userId;
        }
        qp.set('subId1', encodeURIComponent(JSON.stringify(obj)));
      } catch {
        // leave as-is if cannot parse
      }
    }

    return url.toString();
  } catch {
    return urlString;
  }
}

export async function resolveAndRewrite(urlString, myId) {
  // For mavely.app.link short links, resolve to final URL via a HEAD/GET follow redirects
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    if (host.endsWith('mavely.app.link')) {
      // Resolve with fetch following redirects
      const { request } = await import('undici');
      const res = await request(urlString, { maxRedirections: 5, method: 'GET' });
      const finalUrl = res.url || urlString;
      return rewriteMavelyCanonicalLink(finalUrl, myId);
    }
    // If it already looks like a CJ canonical link with sharedid/subId1, rewrite directly
    if (/sharedid=|subId1=/.test(urlString)) {
      return rewriteMavelyCanonicalLink(urlString, myId);
    }
    return urlString;
  } catch {
    return urlString;
  }
}

export async function rewriteTextContent(text, myId) {
  const urls = extractUrls(text);
  let out = text;
  for (const original of urls) {
    const rewritten = await resolveAndRewrite(original, myId);
    if (rewritten && rewritten !== original) {
      out = out.split(original).join(rewritten);
    }
  }
  return out;
}
