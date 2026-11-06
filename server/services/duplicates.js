const Complaint = require('../models/Complaint');
const Flat = require('../models/Flat');

const STOP = new Set('the and for with this that from have has not are was were but our you your there their its into onto out all any can will been very please kindly since still again just also near our flat floor tower building society complaint issue problem'.split(' '));
const OPEN = ['New', 'Assigned', 'In Progress', 'Reopened'];
const WINDOW_DAYS = 7;

const tokens = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)));

function similarity(a, b) {
  const A = tokens(a); const B = tokens(b);
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((t) => B.has(t)).length;
  return inter / (A.size + B.size - inter);
}
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Finds recent open complaints in the same tower about the same issue/location.
 * It only LINKS them: duplicates are never closed or merged automatically.
 */
async function findDuplicates({ tower, flatId, title, description, location, category }) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000);
  const towerFlats = await Flat.find({ tower }).select('_id');
  const candidates = await Complaint.find({
    flat: { $in: towerFlats.map((f) => f._id) }, status: { $in: OPEN }, createdAt: { $gte: since },
  }).sort({ createdAt: 1 }).limit(100);

  const text = `${title} ${description}`;
  return candidates
    .map((c) => {
      const sim = similarity(text, `${c.title} ${c.description}`);
      const sameCategory = category && c.category === category;
      const sameLocation = norm(location) && norm(location) === norm(c.location);
      const isDup = sim >= 0.4 || (sameCategory && sim >= 0.25) || (sameCategory && sameLocation);
      return { complaint: c, sim, isDup };
    })
    .filter((x) => x.isDup)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
    .map((x) => x.complaint);
}

module.exports = { findDuplicates, similarity };
