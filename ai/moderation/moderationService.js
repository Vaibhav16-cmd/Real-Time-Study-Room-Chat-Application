const moderationRules = require("./moderationRules.json");

function analyzeMessageContent(content) {
  const normalized = String(content || "").toLowerCase();

  for (const rule of moderationRules) {
    if (rule.words.some((word) => normalized.includes(word))) {
      return {
        status: "flagged",
        category: rule.category,
        reason: `AI Reason: ${rule.reason}`,
        score: rule.score
      };
    }
  }

  return {
    status: "approved",
    category: null,
    reason: null,
    score: 0.08
  };
}

module.exports = { analyzeMessageContent, moderationRules };
