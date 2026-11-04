// A property's post-stay feedback flow, read the same way by the dashboard, the guest app and the
// analytics/home summaries so they can never disagree about what counts as a "low" rating.
//
//   lowMax       a rating at or below this (in stars) gets the "what went wrong" box; anything above
//                it is saved and the guest is sent to the one enabled review site.
//   prompt       the question shown above that box.
//   reviewSites  where happy guests are sent. At most one is ever switched on.

export const DEFAULT_LOW_MAX = 3;
export const DEFAULT_PROMPT = 'Sorry, how could we improve your stay?';
export const MAX_PROMPT_LENGTH = 200;
export const MAX_REVIEW_SITES = 8;

export const DEFAULT_REVIEW_SITES = [
  { id: 'google', name: 'Google Reviews', url: '', on: false, custom: false },
  { id: 'tripadvisor', name: 'TripAdvisor', url: '', on: false, custom: false },
  { id: 'booking', name: 'Booking.com', url: '', on: false, custom: false },
];

// Only ever http(s) — this URL is what the guest app navigates to.
export const isReviewUrl = (value) => /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(String(value ?? '').trim());

// `doc` is a FeedbackSettings document (or null). Settings saved before the flow was simplified only
// carry `negMax`, which meant the same thing, so it is honoured until the property next saves.
export function resolveFeedbackSettings(doc) {
  const lowMax = Number.isInteger(doc?.lowMax)
    ? doc.lowMax
    : Number.isInteger(doc?.negMax)
      ? doc.negMax
      : DEFAULT_LOW_MAX;
  const prompt = typeof doc?.prompt === 'string' && doc.prompt.trim() ? doc.prompt.trim() : DEFAULT_PROMPT;
  const reviewSites = Array.isArray(doc?.reviewSites) && doc.reviewSites.length
    ? doc.reviewSites.map((s) => ({
        id: String(s.id),
        name: String(s.name ?? ''),
        url: String(s.url ?? ''),
        on: !!s.on,
        custom: !!s.custom,
      }))
    : DEFAULT_REVIEW_SITES.map((s) => ({ ...s }));
  return { lowMax, prompt, reviewSites };
}

// The site a happy guest is sent to: the one that is on and has a usable link.
export function activeReviewSite(settings) {
  return settings.reviewSites.find((s) => s.on && isReviewUrl(s.url)) ?? null;
}

// Validates and cleans what the dashboard sends. Returns { error } or { sites }.
export function sanitizeReviewSites(input) {
  if (!Array.isArray(input) || input.length > MAX_REVIEW_SITES) {
    return { error: `Review sites must be a list of at most ${MAX_REVIEW_SITES}` };
  }
  const sites = [];
  const seen = new Set();
  for (const raw of input) {
    const id = String(raw?.id ?? '').trim();
    const name = String(raw?.name ?? '').trim();
    const url = String(raw?.url ?? '').trim();
    const on = !!raw?.on;
    if (!id || seen.has(id)) return { error: 'Each review site needs its own id' };
    seen.add(id);
    if (name.length > 40) return { error: 'Review site names can be at most 40 characters' };
    if (on && !name) return { error: 'Give the review site a name, or switch it off' };
    if (on && !isReviewUrl(url)) return { error: `${name || 'The review site'} needs a full link starting with https://` };
    sites.push({ id, name, url, on, custom: !!raw?.custom });
  }
  // One destination at a time: the guest is sent straight to it.
  if (sites.filter((s) => s.on).length > 1) return { error: 'Only one review site can be switched on at a time' };
  return { sites };
}
