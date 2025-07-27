// Helper functions for research analysis and processing

import { InformationCompleteness } from './types.js';

export function extractKeyFindings(results: any, query: string): string[] {
  const findings: string[] = [];
  
  if (results && results.results) {
    // Try to extract meaningful information from the results
    const resultText = typeof results.results === 'string' ? results.results : JSON.stringify(results.results);
    
    // Split into sentences and filter for relevance
    const sentences = resultText.split(/[.!?]+/).filter((sentence: string) =>
      sentence.trim().length > 20 &&
      sentence.toLowerCase().includes(query.toLowerCase().split(' ')[0])
    );
    
    findings.push(...sentences.slice(0, 5).map((s: string) => s.trim()));
  }
  
  return findings.length > 0 ? findings : [`Information found related to: ${query}`];
}

export function analyzeSearchResults(results: any): { 
  relevanceScore: number; 
  needsMoreResearch: boolean; 
  resultCount: number; 
  relevantLinks: number;
  summary: string;
} {
  if (!results || !results.results) {
    return {
      relevanceScore: 0,
      needsMoreResearch: true,
      resultCount: 0,
      relevantLinks: 0,
      summary: "No results found"
    };
  }

  const resultText = typeof results.results === 'string' ? results.results : JSON.stringify(results.results);
  const resultCount = (resultText.match(/\n/g) || []).length + 1;
  const linkCount = (resultText.match(/https?:\/\/[^\s]+/g) || []).length;
  
  // Simple relevance scoring based on content length and link count
  const relevanceScore = Math.min(0.9, (resultText.length / 1000 + linkCount * 0.1));
  
  return {
    relevanceScore,
    needsMoreResearch: relevanceScore < 0.6 || linkCount < 3,
    resultCount,
    relevantLinks: linkCount,
    summary: `Found ${resultCount} results with ${linkCount} links`
  };
}

export function analyzeFetchResults(results: any): { 
  relevanceScore: number; 
  needsMoreResearch: boolean; 
  summary: string;
} {
  if (!results || !results.results) {
    return {
      relevanceScore: 0,
      needsMoreResearch: true,
      summary: "No content fetched"
    };
  }

  const content = typeof results.results === 'string' ? results.results : JSON.stringify(results.results);
  const contentLength = content.length;
  
  // Score based on content length and quality indicators
  const relevanceScore = Math.min(0.9, contentLength / 2000);
  
  return {
    relevanceScore,
    needsMoreResearch: relevanceScore < 0.5,
    summary: `Fetched ${contentLength} characters of content`
  };
}

export function assessInformationCompleteness(information: string[], originalQuery: string): InformationCompleteness {
  // Debug logging to identify the issue
  console.error('DEBUG: assessInformationCompleteness called with:', {
    informationType: typeof information,
    informationValue: information,
    isArray: Array.isArray(information),
    originalQuery
  });
  
  // Ensure information is an array
  if (!Array.isArray(information)) {
    console.error('ERROR: information is not an array, converting to array');
    information = [];
  }
  
  if (information.length === 0) {
    return 'insufficient';
  }
  
  const totalLength = information.join(' ').length;
  const queryWords = originalQuery.toLowerCase().split(' ');
  
  // Count how many query terms appear in the gathered information
  const informationText = information.join(' ').toLowerCase();
  const matchedTerms = queryWords.filter(word => informationText.includes(word)).length;
  const termCoverage = matchedTerms / queryWords.length;
  
  if (totalLength < 500 || termCoverage < 0.3) {
    return 'insufficient';
  } else if (totalLength < 1500 || termCoverage < 0.6) {
    return 'partial';
  } else if (totalLength < 3000 || termCoverage < 0.8) {
    return 'sufficient';
  } else {
    return 'complete';
  }
}

export function calculateConfidenceScore(information: string[], stepCount: number): number {
  console.error('DEBUG: calculateConfidenceScore called with:', {
    informationType: typeof information,
    informationValue: information,
    isArray: Array.isArray(information),
    stepCount
  });
  
  if (!Array.isArray(information)) {
    console.error('ERROR: information is not an array in calculateConfidenceScore, converting to array');
    information = [];
  }
  
  if (information.length === 0) return 0;
  
  const totalLength = information.join(' ').length;
  const avgLength = totalLength / information.length;
  
  // Base score on information quality and quantity
  let score = Math.min(0.9, (totalLength / 2000) * 0.6 + (avgLength / 200) * 0.3 + (information.length / 5) * 0.1);
  
  // Adjust for research thoroughness
  if (stepCount > 3) score += 0.1;
  if (stepCount > 5) score += 0.1;
  
  return Math.min(1.0, score);
}

export function extractRelevantLinks(content: string, maxLinks: number = 5): string[] {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  const urls = content.match(urlPattern) || [];
  
  // Filter out common non-content URLs
  const relevantUrls = urls.filter(url => 
    !url.includes('google.com/search') &&
    !url.includes('javascript:') &&
    !url.includes('.css') &&
    !url.includes('.js') &&
    !url.includes('.png') &&
    !url.includes('.jpg') &&
    !url.includes('.gif')
  );
  
  // Return unique URLs, limited to maxLinks
  return [...new Set(relevantUrls)].slice(0, maxLinks);
}

export function scoreUrlRelevance(url: string, query: string): number {
  const queryTerms = query.toLowerCase().split(' ');
  const urlLower = url.toLowerCase();
  
  let score = 0;
  
  // Score based on query terms in URL
  queryTerms.forEach(term => {
    if (urlLower.includes(term)) {
      score += 0.3;
    }
  });
  
  // Bonus for reputable domains
  const reputableDomains = ['wikipedia.org', 'github.com', 'stackoverflow.com', '.edu', '.gov', 'arxiv.org', 'medium.com'];
  if (reputableDomains.some(domain => urlLower.includes(domain))) {
    score += 0.2;
  }
  
  // Penalty for very long URLs (often tracking/advertising)
  if (url.length > 100) {
    score -= 0.1;
  }
  
  return Math.max(0, Math.min(1, score));
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeQuery(query: string): string {
  // Remove potentially harmful characters and normalize whitespace
  return query
    .replace(/[<>\"'&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500); // Limit query length
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function truncateText(text: string, maxLength: number = 1000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}