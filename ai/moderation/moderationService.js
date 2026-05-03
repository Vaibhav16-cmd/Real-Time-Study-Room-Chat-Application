const moderationRules = require("./moderationRules.json");

function normalizeMessage(content) {
  return String(content || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[@]/g, "a")
    .replace(/[0]/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9\u0900-\u097f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTerm(term) {
  return normalizeMessage(term);
}

function matchesRuleWord(normalizedMessage, compactMessage, word) {
  const normalizedWord = normalizeTerm(word);
  if (!normalizedWord) {
    return false;
  }

  const compactWord = normalizedWord.replace(/\s+/g, "");

  if (normalizedWord.includes(" ")) {
    return (
      normalizedMessage.includes(normalizedWord) ||
      compactMessage.includes(compactWord)
    );
  }

  const tokenPattern = new RegExp(`(^|\\s)${normalizedWord}(\\s|$)`, "u");
  return (
    tokenPattern.test(normalizedMessage) ||
    compactMessage.includes(compactWord)
  );
}

function analyzeMessageContent(content) {
  const normalized = normalizeMessage(content);
  const compact = normalized.replace(/\s+/g, "");

  for (const rule of moderationRules) {
    if (rule.words.some((word) => matchesRuleWord(normalized, compact, word))) {
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

module.exports = {
  analyzeMessageContent,
  moderationRules,
  normalizeMessage
};
