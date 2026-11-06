const Flat = require('../models/Flat');
const { ApiError } = require('../middleware/errorHandler');

async function listFlats(req, res, next) {
  try {
    const { tower } = req.query;
    const filter = tower ? { tower: String(tower) } : {};
    const flats = await Flat.find(filter).sort({ flatNumber: 1 }).limit(500);
    res.json({ flats });
  } catch (err) { next(err); }
}

async function getFlat(req, res, next) {
  try {
    const flat = await Flat.findById(req.params.flatId);
    if (!flat) throw new ApiError(404, 'Flat not found');
    res.json({ flat });
  } catch (err) { next(err); }
}

module.exports = { listFlats, getFlat };
