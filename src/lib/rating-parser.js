// Rating parser for YouTube content ratings
// Supports MPAA (USA) and BBFC (UK) rating systems

const RATING_SCHEMES = {
  mpaa: {
    g: {age: 0, severity: 'SAFE', description: 'General Audiences'},
    pg: {age: 7, severity: 'GUIDANCE', description: 'Parental Guidance Suggested'},
    pg13: {age: 13, severity: 'TEEN', description: 'Parents Strongly Cautioned'},
    r: {age: 17, severity: 'MATURE', description: 'Restricted'},
    nc17: {age: 18, severity: 'ADULT', description: 'Adults Only'},
    unrated: {age: null, severity: 'UNKNOWN', description: 'Unrated'}
  },
  bbfc: {
    u: {age: 0, severity: 'SAFE', description: 'Universal'},
    pg: {age: 8, severity: 'GUIDANCE', description: 'Parental Guidance'},
    '12': {age: 12, severity: 'TEEN', description: 'Suitable for 12 years and over'},
    '12a': {age: 12, severity: 'TEEN', description: 'Suitable for 12 years and over (with adult)'},
    '15': {age: 15, severity: 'TEEN', description: 'Suitable only for 15 years and over'},
    '18': {age: 18, severity: 'ADULT', description: 'Suitable only for adults'},
    r18: {age: 18, severity: 'ADULT', description: 'Restricted 18'}
  }
};

/**
 * Parse YouTube contentRating object and extract MPAA/BBFC ratings
 * @param {Object} contentRating - YouTube contentRating object from API
 * @returns {Array} Array of parsed rating objects
 */
function parseContentRating(contentRating) {
  if (!contentRating || typeof contentRating !== 'object') {
    return [];
  }

  const parsedRatings = [];

  // Check for MPAA rating
  if (contentRating.mpaaRating) {
    const ratingValue = contentRating.mpaaRating.toLowerCase();
    const ratingInfo = RATING_SCHEMES.mpaa[ratingValue];

    if (ratingInfo) {
      parsedRatings.push({
        scheme: 'MPAA',
        value: contentRating.mpaaRating.toUpperCase(),
        age: ratingInfo.age,
        severity: ratingInfo.severity,
        description: ratingInfo.description
      });
    }
  }

  // Check for BBFC rating
  if (contentRating.bbfcRating) {
    const ratingValue = contentRating.bbfcRating.toLowerCase();
    const ratingInfo = RATING_SCHEMES.bbfc[ratingValue];

    if (ratingInfo) {
      parsedRatings.push({
        scheme: 'BBFC',
        value: contentRating.bbfcRating.toUpperCase(),
        age: ratingInfo.age,
        severity: ratingInfo.severity,
        description: ratingInfo.description
      });
    }
  }

  return parsedRatings;
}

/**
 * Get the most restrictive (highest age) rating from a list of parsed ratings
 * @param {Array} parsedRatings - Array of parsed rating objects
 * @returns {Object|null} The most restrictive rating or null if none
 */
function getMostRestrictiveRating(parsedRatings) {
  if (!parsedRatings || parsedRatings.length === 0) {
    return null;
  }

  return parsedRatings.reduce((highest, current) => {
    if (current.age === null) return highest;
    if (highest === null || highest.age === null) return current;
    return current.age > highest.age ? current : highest;
  }, parsedRatings[0]);
}

/**
 * Check if a rating exceeds the acceptable age threshold
 * @param {Object} rating - Parsed rating object
 * @param {number} threshold - Maximum acceptable age (default: 13)
 * @returns {boolean} True if rating exceeds threshold
 */
function exceedsThreshold(rating, threshold = 13) {
  if (!rating || rating.age === null) {
    return false;
  }
  return rating.age > threshold;
}

/**
 * Get severity level for classification flags
 * @param {string} severity - Rating severity (SAFE, GUIDANCE, TEEN, MATURE, ADULT)
 * @returns {string} Flag severity level (HIGH, MEDIUM, LOW)
 */
function getFlagSeverity(severity) {
  const severityMap = {
    ADULT: 'HIGH',
    MATURE: 'HIGH',
    TEEN: 'MEDIUM',
    GUIDANCE: 'LOW',
    SAFE: 'LOW',
    UNKNOWN: 'MEDIUM'
  };
  return severityMap[severity] || 'MEDIUM';
}

/**
 * Format rating for display in reports
 * @param {Object} rating - Parsed rating object
 * @returns {string} Formatted rating string
 */
function formatRating(rating) {
  if (!rating) return 'No rating';

  if (rating.age === null) {
    return `${rating.scheme} ${rating.value} (${rating.description})`;
  }

  return `${rating.scheme} ${rating.value} (ages ${rating.age}+) - ${rating.description}`;
}

export {
  parseContentRating,
  getMostRestrictiveRating,
  exceedsThreshold,
  getFlagSeverity,
  formatRating,
  RATING_SCHEMES
};
