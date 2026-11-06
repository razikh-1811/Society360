const aiClassifier = require('./aiClassifier');
const { detectEmergency } = require('./emergency');

const LOW_CONFIDENCE = 0.6;

/**
 * Combines AI classification with deterministic safety rules.
 *  1. Emergency keywords are detected independently of AI.
 *  2. Gemini is asked for category/urgency. If it fails, we use the "Other" fallback and flag manual review.
 *     We never fabricate an AI response.
 *  3. Safety rules override: an emergency is always Critical and escalated, whatever the AI said.
 */
async function triageComplaint({ title, description }) {
  const text = `${title}. ${description}`;
  const emergency = detectEmergency(text);

  let ai = null;
  let aiError = null;
  try {
    ai = await aiClassifier.callGemini(text);
  } catch (err) {
    aiError = err.message || 'AI unavailable';
  }

  const result = ai
    ? {
        category: ai.category, urgency: ai.urgency, reasoning: ai.reasoning, confidence: ai.confidence,
        source: 'gemini', needsManualReview: ai.confidence != null && ai.confidence < LOW_CONFIDENCE,
        aiCategory: ai.category, aiUrgency: ai.urgency, aiError: null,
      }
    : {
        category: 'Other', urgency: 'Medium', confidence: null, source: 'fallback', needsManualReview: true,
        reasoning: 'Automatic classification was unavailable, so this complaint needs manual review by the help desk.',
        aiCategory: null, aiUrgency: null, aiError,
      };

  if (emergency.isEmergency) {
    result.urgency = 'Critical';
    result.source = 'safety_rule';
    if (!ai && emergency.categoryHint) result.category = emergency.categoryHint;
    result.reasoning = `Safety rule: emergency keyword detected (${emergency.keywords.join(', ')}). ${ai ? `AI note: ${ai.reasoning}` : result.reasoning}`.slice(0, 500);
    result.needsManualReview = !ai;
  }

  return { ...result, emergency };
}

module.exports = { triageComplaint, LOW_CONFIDENCE };
