// Helper functions for research analysis and processing

interface ExtractedContent {
  title: string;
  content: string;
  quality: 'high' | 'medium' | 'low';
  wordCount: number;
  keyPoints: string[];
}

export function enhancedContentExtraction(rawContent: string, url: string): ExtractedContent {
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('Raw content must be a non-empty string');
  }
  
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  const lines = rawContent.split('\n');
  let title = '';
  const contentLines: string[] = [];
  const keyPoints: string[] = [];

  // Enhanced title extraction
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Look for title patterns (improved)
    if (!title && (
      line.includes('<title>') ||
      line.includes('<h1>') ||
      line.includes('**') ||
      line.includes('##') ||
      (line.match(/^[A-Z][^.!?]*[.!?]?$/) && line.length > 10 && line.length < 100)
    )) {
      title = line.replace(/<[^>]+>/g, '')
        .replace(/\*\*/g, '')
        .replace(/##/g, '')
        .replace(/&[^;]+;/g, '')
        .trim();
    }
  }

  // Enhanced content extraction
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.length < 10) continue;

    // Skip navigation, ads, and boilerplate
    if (
      cleanLine.includes('cookie') ||
      cleanLine.includes('advertisement') ||
      cleanLine.includes('subscribe') ||
      cleanLine.includes('newsletter') ||
      cleanLine.match(/^(menu|nav|header|footer|sidebar)/i) ||
      cleanLine.match(/^\d+\s*(min|mins|minutes?)\s*(read|ago)/i)
    ) continue;

    // Collect substantial content
    if (cleanLine.length > 30) {
      contentLines.push(cleanLine);

      // Extract key points (sentences with important indicators)
      if (
        cleanLine.length > 50 &&
        cleanLine.length < 300 &&
        (cleanLine.includes(':') ||
          cleanLine.match(/\b(because|therefore|however|important|key|main|primary|essential)\b/i) ||
          cleanLine.match(/^\d+\./) ||
          cleanLine.includes('•') ||
          cleanLine.includes('-'))
      ) {
        keyPoints.push(cleanLine);
      }
    }
  }

  const content = contentLines.join('\n\n');
  const wordCount = content.split(/\s+/).length;

  // Determine content quality
  let quality: 'high' | 'medium' | 'low' = 'low';
  if (wordCount > 200 && keyPoints.length > 2) quality = 'medium';
  if (wordCount > 500 && keyPoints.length > 5) quality = 'high';

  try {
    return {
      title: title || `Content from ${new URL(url).hostname}`,
      content,
      keyPoints: keyPoints.slice(0, 10), // Limit key points
      wordCount,
      quality
    };
  } catch {
    return {
      title: title || 'Unknown Source',
      content,
      keyPoints: keyPoints.slice(0, 10),
      wordCount,
      quality
    };
  }
}

// URL utilities (consolidated from url-utilities.ts)
interface ScoredUrl {
  url: string;
  score: number;
}

// Extract URLs from general content with regex
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

// Consolidated URL relevance scoring (enhanced version)
export function scoreUrlRelevance(url: string, query: string, title?: string, position?: number): number {
  let score = 0;
  const queryTerms = query.toLowerCase().split(' ');
  const urlLower = url.toLowerCase();
  
  // Position factor (if provided - earlier results are generally more relevant)
  if (typeof position === 'number') {
    score += Math.max(0, (10 - position) / 10) * 0.2;
  }
  
  // Title factor (if provided)
  if (title) {
    const titleLower = title.toLowerCase();
    const titleLength = title.length;
    
    // Title length factor (reasonable length titles are often better)
    if (titleLength >= 20 && titleLength <= 80) {
      score += 0.15;
    }
    
    // Query term presence in title
    const matchingTerms = queryTerms.filter(term => titleLower.includes(term)).length;
    score += (matchingTerms / queryTerms.length) * 0.25;
    
    // Avoid obviously commercial or low-quality patterns
    if (title.toLowerCase().includes('buy now') || title.toLowerCase().includes('click here')) {
      score -= 0.2;
    }
  }
  
  // Score based on query terms in URL
  queryTerms.forEach(term => {
    if (urlLower.includes(term)) {
      score += 0.2;
    }
  });
  
  // Domain credibility (enhanced list)
  const domain = url.split('/')[2] || '';
  const reputableDomains = ['wikipedia.org', 'github.com', 'stackoverflow.com', '.edu', '.gov', 'arxiv.org', 'medium.com'];
  if (reputableDomains.some(reputableDomain => domain.includes(reputableDomain))) {
    score += 0.2;
  }
  
  // Penalty for suspicious domains
  if (domain.includes('ads') || domain.includes('tracker') || domain.includes('spam')) {
    score -= 0.3;
  }
  
  // Penalty for very long URLs (often tracking/advertising)
  if (url.length > 100) {
    score -= 0.1;
  }
  
  return Math.max(0, Math.min(1, score));
}

// Extract links with priority scoring
export function extractLinksWithPriority(content: string, query: string, maxLinks: number = 5): ScoredUrl[] {
  const urls = extractRelevantLinks(content, maxLinks * 2);
  
  // Score each URL and return top-scored ones
  const scoredUrls = urls.map(url => ({
    url,
    score: scoreUrlRelevance(url, query)
  })).sort((a, b) => b.score - a.score);
  
  return scoredUrls.slice(0, maxLinks);
}