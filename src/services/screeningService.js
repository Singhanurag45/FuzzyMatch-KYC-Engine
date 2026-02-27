const fs = require('fs').promises;
const path = require('path');
const { normalizeName, nameSimilarity } = require('../utils/nameUtils');

const MATCH_TYPES = {
  EXACT_MATCH: 'EXACT_MATCH',       // score >= 0.90
  POSSIBLE_MATCH: 'POSSIBLE_MATCH', // 0.75 <= score < 0.90
  NO_MATCH: 'NO_MATCH',             // score < 0.75
};

const PROJECT_ROOT = path.resolve(__dirname, '../..');

function getMatchType(score) {
  if (score >= 0.90){
    return MATCH_TYPES.EXACT_MATCH;
  } 
  if (score >= 0.75){
    return MATCH_TYPES.POSSIBLE_MATCH;
  }

  return MATCH_TYPES.NO_MATCH;
}

/**
 * Collect all names to screen from input (fullName + aliases).
 * @param {object} input - Parsed input.json
 * @returns {string[]}
 */
function getNamesToScreen(input) {
  const names = [];
  if (input.fullName) names.push(input.fullName);
  if (Array.isArray(input.aliases)) names.push(...input.aliases.filter(Boolean));
  return names.length ? names : [''];
}

/**
 * Score input name against watchlist; return sorted list of { watchlistEntry, score }.
 */
function scoreAgainstWatchlist(inputName, watchlist) {
  return watchlist
    .map((entry) => ({
      watchlistEntry: entry,
      score: nameSimilarity(inputName, entry.name),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Run screening for one request: read input (from file or body), compare to watchlist, write output.
 * @param {string} userId
 * @param {string} requestId
 * @param {string} logPrefix - e.g. requestId for logs
 * @param {object|null} bodyInput - optional { fullName, aliases?, requestId? } from request body for testing
 * @returns {{ outputDir: string } | { error: string }}
 */
async function processRequest(userId, requestId, logPrefix = requestId, bodyInput = null) {
  const log = (msg, meta = {}) =>
    console.log(JSON.stringify({ requestId: logPrefix, message: msg, ...meta }));

  const inputPath = path.join(PROJECT_ROOT, 'data', userId, requestId, 'input', 'input.json');
  const outputDir = path.join(PROJECT_ROOT, 'data', userId, requestId, 'output');
  const detailedPath = path.join(outputDir, 'detailed.json');
  const consolidatedPath = path.join(outputDir, 'consolidated.json');
  const watchlistPath = path.join(PROJECT_ROOT, 'watchlist.json');

  try {
    log('Starting screening');

    const useBodyInput = bodyInput && (bodyInput.fullName != null || (Array.isArray(bodyInput.aliases) && bodyInput.aliases.length > 0));
    const [inputFileExists, watchlistExists, detailedExists] = await Promise.all([
      fs.access(inputPath).then(() => true).catch(() => false),
      fs.access(watchlistPath).then(() => true).catch(() => false),
      fs.access(detailedPath).then(() => true).catch(() => false),
    ]);

    if (!watchlistExists) {
      log('Watchlist file missing', { path: watchlistPath });
      return { error: 'Watchlist file missing' };
    }
    if (!useBodyInput && !inputFileExists) {
      log('Input file missing and no body input', { path: inputPath });
      return { error: 'Input file missing' };
    }
    if (!useBodyInput && detailedExists) {
      log('Output already exists, skipping reprocessing', { outputDir });
      return { outputDir };
    }

    let input;
    if (useBodyInput) {
      log('Using input from request body');
      input = {
        requestId: bodyInput.requestId || requestId,
        fullName: bodyInput.fullName || '',
        aliases: Array.isArray(bodyInput.aliases) ? bodyInput.aliases : undefined,
        country: bodyInput.country,
      };
    } else {
      log('Reading input and watchlist');
      let inputJson;
      try {
        inputJson = await fs.readFile(inputPath, 'utf8');
      } catch (e) {
        log('Failed to read input file', { error: e.message });
        return { error: 'Failed to read input file' };
      }
      try {
        input = JSON.parse(inputJson);
      } catch (e) {
        log('Invalid JSON in input file', { error: e.message });
        return { error: 'Invalid JSON in input file' };
      }
    }

    let watchlistJson;
    try {
      watchlistJson = await fs.readFile(watchlistPath, 'utf8');
    } catch (e) {
      log('Failed to read watchlist file', { error: e.message });
      return { error: 'Failed to read watchlist file' };
    }
    let watchlist;
    try {
      watchlist = JSON.parse(watchlistJson);
    } catch (e) {
      log('Invalid JSON in watchlist file', { error: e.message });
      return { error: 'Invalid JSON in watchlist file' };
    }

    if (!Array.isArray(watchlist)) {
      log('Watchlist must be a JSON array');
      return { error: 'Watchlist must be a JSON array' };
    }

    if (detailedExists && useBodyInput) {
      log('Reprocessing with body input (overwriting existing output)');
    }

    const namesToScreen = getNamesToScreen(input);
    log('Names to screen', { count: namesToScreen.length, names: namesToScreen });

    const allScores = [];
    for (const name of namesToScreen) {
      const ranked = scoreAgainstWatchlist(name, watchlist);
      for (const { watchlistEntry, score } of ranked) {
        const existing = allScores.find(
          (x) => x.watchlistEntry.id === watchlistEntry.id
        );
        if (!existing || score > existing.score) {
          if (existing) {
            existing.score = score;
            existing.matchedInputName = name;
          } else {
            allScores.push({
              watchlistEntry,
              score,
              matchedInputName: name,
            });
          }
        }
      }
    }

    allScores.sort((a, b) => b.score - a.score);
    const top3 = allScores.slice(0, 3).map(({ watchlistEntry, score, matchedInputName }) => ({
      id: watchlistEntry.id,
      name: watchlistEntry.name,
      score: Math.round(score * 100) / 100,
      matchedInputName: matchedInputName || null,
    }));

    const best = top3[0] || { id: null, name: null, score: 0, matchedInputName: null };
    const bestScore = best.score;
    const matchType = getMatchType(bestScore);

    log('Best match', {
      watchlistId: best.id,
      score: bestScore,
      matchType,
    });

    const primaryName = input.fullName || namesToScreen[0] || '';
    const detailed = {
      rawName: primaryName,
      normalizedName: normalizeName(primaryName),
      allNamesScreened: namesToScreen.map((n) => ({ raw: n, normalized: normalizeName(n) })),
      bestMatch: {
        id: best.id,
        name: best.name,
        score: best.score,
        matchType,
      },
      top3Matches: top3.map((m) => ({
        ...m,
        matchType: getMatchType(m.score),
      })),
    };

    const consolidated = {
      requestId: input.requestId || requestId,
      screeningResult: matchType,
      bestMatch: best.id
        ? { id: best.id, name: best.name, score: best.score }
        : null,
      timestamp: new Date().toISOString(),
    };

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      detailedPath,
      JSON.stringify(detailed, null, 2),
      'utf8'
    );
    await fs.writeFile(
      consolidatedPath,
      JSON.stringify(consolidated, null, 2),
      'utf8'
    );
   
    log('Screening complete', { outputDir });
    console.log(consolidated);
    return { outputDir , consolidated};
    
  } catch (e) {
    log('Unexpected error', { error: e.message, stack: e.stack });
    return { error: e.message || 'Processing failed' };
  }
}

module.exports = {
  processRequest,
  getMatchType,
  MATCH_TYPES,
};
