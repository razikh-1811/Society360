/**
 * Deterministic emergency detection. Runs on every complaint, independent of AI.
 * Any match forces Critical urgency and duty-manager escalation; AI output can never lower it.
 */
const RULES = [
  { label: 'Fire', categoryHint: 'Other', re: /\bfire\b/i,
    // Phrases that contain "fire" but describe equipment/maintenance, removed before testing.
    ignore: /\bfire[\s-]+(extinguishers?|drills?|exits?|audits?|safety\s+(audit|inspection|certificate))\b/gi },
  { label: 'Gas leak', categoryHint: 'Other',
    re: /\bgas[\s-]*(is\s+)?(leak\w*)\b|\b(leak\w*|smell\w*)\s+(of\s+|like\s+)?(a\s+)?gas\b|\bgas\s+smell\w*/i },
  { label: 'Lift stuck', categoryHint: 'Lift',
    re: /\b(lift|elevator)\b[^.!?\n]{0,40}\b(stuck|trapped|jammed)\b|\b(stuck|trapped)\b[^.!?\n]{0,30}\b(in|inside)\b[^.!?\n]{0,15}\b(lift|elevator)\b/i },
  { label: 'Electric shock', categoryHint: 'Electrical',
    re: /\belectric(al)?\s+shock\w*|\belectrocut\w*|\b(got|get|getting|received)\s+(an?\s+)?(electric\s+)?shock(ed)?\b|\bshocked\s+by\b/i },
];

function detectEmergency(text) {
  const raw = String(text || '');
  const matches = RULES.filter((r) => r.re.test(r.ignore ? raw.replace(r.ignore, ' ') : raw));
  return {
    isEmergency: matches.length > 0,
    keywords: matches.map((m) => m.label),
    categoryHint: matches[0]?.categoryHint || null,
  };
}

module.exports = { detectEmergency, RULES };
