(function () {
  "use strict";

  const RESULTS_KEY = "deutsch_a1_results_v1";
  const ATTEMPT_ID = `embedded-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  function readSession() {
    const keys = ["deutsch_a1_session_v1", "deutsch_a1_session_v2"];
    for (const key of keys) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        if (value && value.id) return value;
      } catch (error) {}
    }
    return null;
  }

  function storageKey(key) {
    const session = readSession();
    const student = session && session.id ? String(session.id) : "guest";
    return `deutsch_a1_${student}_${String(key || "progress")}`;
  }

  function normalizeText(value) {
    return String(value || "").toLocaleLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/\s+/g, " ").trim();
  }

  function defaultStageForExercise(key) {
    const match = String(key || "").match(/^u(\d+)$/i);
    if (!match) return "stage1";
    const number = Number(match[1]);
    return number <= 4 ? "stage1" : number <= 8 ? "stage2" : number <= 11 ? "stage3" : number <= 14 ? "stage4" : "stage5";
  }

  function exerciseLabel(key) {
    const node = document.getElementById(String(key));
    if (!node) return String(key || "Übung");
    const heading = node.querySelector("h2,h3,h4,.exercise-title,.q-title");
    const value = heading && heading.textContent ? heading.textContent.trim() : "";
    return value || String(key || "Übung");
  }

  function stageLabel(stageId) {
    const node = document.querySelector(`[data-stage-screen="${stageId}"]`) || document.querySelector(`[data-stage-item="${stageId}"]`);
    if (!node) return stageId.replace("stage", "المرحلة ");
    const heading = node.querySelector("h2,h3,h4,.stage-title");
    return heading && heading.textContent ? heading.textContent.trim() : stageId.replace("stage", "المرحلة ");
  }

  function inferSkill(exerciseName, questionText) {
    const text = normalizeText(`${exerciseName || ""} ${questionText || ""}`);
    if (/hoeren|horen|hordetektiv|audio|podcast|listen/.test(text)) return "listening";
    if (/dialog|sprechen|gespraech|aussprache|konversation|mundlich/.test(text)) return "speaking";
    if (/schreib|schrift|ubersetzungswerkstatt|text schreiben|text verfassen/.test(text)) return "writing";
    if (/satzbau|lucken|grammatik|praposition|fehler|worter sortieren|am oder im|verben im prasens|verben im alltag|konjug|welcher satz|welcher artikel|wie viel|verbposition|wie ist das wetter|_{2,}|regnen|weht|fahre|wohnst|arbeitest/.test(text)) return "sentences";
    if (/worter verbinden|artikel-detektiv|ubersetzungsquiz|buchstabensalat|wortschatz|vokabel|wetter|jahreszeit|wochentag|adjektiv|nomen|gegenteil|verben unterwegs|was bedeutet|was ist das gegenteil/.test(text)) return "vocab";
    return "";
  }

  function cleanWord(value) {
    return String(value || "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/[↔＋؟]/g, "").replace(/\s+/g, " ").trim();
  }

  function quotedTerm(text) {
    const match = String(text || "").match(/[„“«"]([^„“»"]+)[“”»"]/);
    return match ? match[1].trim() : "";
  }

  function answerText(card) {
    let value = String(card && card.dataset && card.dataset.answer || "").trim();
    if (!value && card && card.dataset && card.dataset.answers) {
      try {
        const parsed = JSON.parse(card.dataset.answers);
        value = Array.isArray(parsed) ? String(parsed[0] || "") : "";
      } catch (error) {}
    }
    return value;
  }

  function collectItemDetails(exerciseIds) {
    const itemScores = {};
    const itemLabels = {};
    const itemMeanings = {};
    const itemSkillTypes = {};
    const itemParents = {};

    (exerciseIds || []).forEach(exerciseId => {
      const section = document.getElementById(String(exerciseId));
      if (!section) return;
      const parentLabel = exerciseLabel(exerciseId);

      // Word-to-meaning matching: save each successfully matched German word separately.
      const leftButtons = Array.from(section.querySelectorAll('[data-match][data-side="left"]'));
      leftButtons.forEach((button, index) => {
        if (!button.classList.contains("matched")) return;
        const group = button.dataset.match || "";
        const pair = button.dataset.pair || button.dataset.key || String(index + 1);
        const rightButton = Array.from(section.querySelectorAll('[data-match][data-side="right"]')).find(candidate => {
          const candidatePair = candidate.dataset.pair || candidate.dataset.key || "";
          return candidate.dataset.match === group && candidatePair === pair;
        });
        const german = cleanWord(button.querySelector(".match-label")?.textContent || button.textContent);
        const arabic = cleanWord(rightButton?.querySelector(".match-label,.small-ar")?.textContent || rightButton?.textContent || "");
        if (!german) return;
        const safePair = String(pair).replace(/[^a-z0-9_-]/gi, "_");
        const key = `item_${exerciseId}_${safePair}`;
        itemScores[key] = { correct: 1, total: 1 };
        itemLabels[key] = german;
        itemMeanings[key] = arabic;
        itemSkillTypes[key] = inferSkill(parentLabel, german) || "vocab";
        itemParents[key] = String(exerciseId);
      });

      // Question-level answers: keep each checked question instead of only the exercise total.
      const cards = Array.from(section.querySelectorAll(".q-item.correct,.q-item.incorrect"));
      cards.forEach((card, index) => {
        const prompt = String(card.querySelector(".q-label,.question-label,.question-text")?.textContent || card.dataset.field || `Question ${index + 1}`).trim();
        const answer = answerText(card);
        const skill = inferSkill(parentLabel, prompt) || inferSkill("", prompt);
        const quoted = quotedTerm(prompt);
        const answerIsArabic = /[\u0600-\u06FF]/.test(answer);
        let label = quoted || (skill === "vocab" && answer && !answerIsArabic ? answer : prompt);
        label = cleanWord(label) || `Question ${index + 1}`;
        const key = `item_${exerciseId}_q${index + 1}`;
        itemScores[key] = { correct: card.classList.contains("correct") ? 1 : 0, total: 1 };
        itemLabels[key] = label;
        if (answerIsArabic) itemMeanings[key] = answer;
        if (skill) itemSkillTypes[key] = skill;
        itemParents[key] = String(exerciseId);
      });
    });

    return { itemScores, itemLabels, itemMeanings, itemSkillTypes, itemParents };
  }

  function normalizeScores(scores, scoreTotals) {
    const result = {};
    const totals = scoreTotals && typeof scoreTotals === "object" ? scoreTotals : {};
    Object.entries(scores && typeof scores === "object" ? scores : {}).forEach(([key, value]) => {
      const correct = value && typeof value === "object" ? Number(value.correct) || 0 : Number(value) || 0;
      const total = value && typeof value === "object" ? Number(value.total) || 0 : Number(totals[key]) || 0;
      if (total > 0) result[key] = { correct: Math.max(0, Math.min(total, correct)), total };
    });
    return result;
  }

  function report(moduleId, title, completed, scores, totalExercises, scoreTotals) {
    const session = readSession();
    const studentId = session && session.id ? String(session.id) : "";
    const safeCompleted = completed && typeof completed === "object" ? completed : {};
    const safeScores = normalizeScores(scores, scoreTotals);
    const safeTotals = {};
    const labels = {};
    const stageByExercise = {};
    const stageLabels = {};
    const visited = {};
    const visitedStages = {};
    let points = 0;
    let maxPoints = 0;

    Object.entries(safeScores).forEach(([key, value]) => {
      points += value.correct;
      maxPoints += value.total;
      safeTotals[key] = value.total;
      labels[key] = exerciseLabel(key);
      const stageId = defaultStageForExercise(key);
      stageByExercise[key] = stageId;
      stageLabels[stageId] = stageLabel(stageId);
      visited[key] = true;
      visitedStages[stageId] = true;
    });
    Object.entries(safeCompleted).forEach(([key, value]) => {
      if (value !== true) return;
      visited[key] = true;
      const stageId = defaultStageForExercise(key);
      stageByExercise[key] = stageId;
      stageLabels[stageId] = stageLabels[stageId] || stageLabel(stageId);
      visitedStages[stageId] = true;
      if (!labels[key]) labels[key] = exerciseLabel(key);
    });

    const detailedItems = collectItemDetails(Object.keys(safeScores));
    const parsedLesson = String(moduleId || "").match(/lektion[-_ ]?(\d{1,2})/i);
    const payload = {
      type: "deutsch-a1-progress-report",
      moduleId: String(moduleId || "exercise"),
      title: String(title || moduleId || "Übungen"),
      lessonNumber: parsedLesson ? Number(parsedLesson[1]) : 0,
      contentType: "test",
      activityType: "test",
      source: "embedded-exercise",
      points,
      maxPoints,
      percent: maxPoints > 0 ? Math.round(points / maxPoints * 100) : 0,
      completedExercises: Object.values(safeCompleted).filter(value => value === true).length,
      totalExercises: Math.max(0, Number(totalExercises) || Object.keys(safeCompleted).length),
      completed: safeCompleted,
      visited,
      visitedStages,
      scores: safeScores,
      scoreTotals: safeTotals,
      exerciseLabels: labels,
      stageByExercise,
      stageLabels,
      ...detailedItems,
      attemptId: ATTEMPT_ID,
      updatedAt: new Date().toISOString()
    };

    // Local backup is used by the parent app if the iframe is closed before a message arrives.
    try {
      if (studentId) {
        const all = JSON.parse(localStorage.getItem(RESULTS_KEY) || "{}");
        all[studentId] = all[studentId] && typeof all[studentId] === "object" ? all[studentId] : {};
        all[studentId][payload.moduleId] = payload;
        localStorage.setItem(RESULTS_KEY, JSON.stringify(all));
      }
    } catch (error) {
      console.warn("Could not cache Deutsch A1 exercise results", error);
    }

    try {
      if (window.parent && window.parent !== window) window.parent.postMessage(payload, "*");
    } catch (error) {
      console.warn("Could not send Deutsch A1 exercise results to the parent app", error);
    }
    return payload;
  }

  window.DeutschA1Progress = window.DeutschA1Progress || {};
  window.DeutschA1Progress.storageKey = storageKey;
  window.DeutschA1Progress.report = report;
})();
