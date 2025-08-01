// Node.js built-ins
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Local modules
import { logger } from './logger.js';

// Persistent blocked domains management
const BLOCKED_DOMAINS_FILE = join(homedir(), '.web-tools-mcp', 'blocked-domains.json');

function ensureConfigDir(): void {
  const configDir = join(homedir(), '.web-tools-mcp');
  if (!existsSync(configDir)) {
    try {
      mkdirSync(configDir, { recursive: true });
    } catch (error) {
      logger.error('Could not create config directory', 'ensureConfigDirectory', error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export function loadPersistentBlockedDomains(): string[] {
  try {
    ensureConfigDir();
    if (existsSync(BLOCKED_DOMAINS_FILE)) {
      const data = readFileSync(BLOCKED_DOMAINS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed.blocked_domains) ? parsed.blocked_domains : [];
    }
  } catch (error) {
    logger.error('Could not load persistent blocked domains', 'loadPersistentBlockedDomains', error instanceof Error ? error : new Error(String(error)));
  }
  return [];
}

export function savePersistentBlockedDomains(domains: string[]): void {
  try {
    ensureConfigDir();
    const data = {
      blocked_domains: domains,
      last_updated: new Date().toISOString()
    };
    writeFileSync(BLOCKED_DOMAINS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.error('Could not save persistent blocked domains', 'addToPersistentBlockedDomains', error instanceof Error ? error : new Error(String(error)));
  }
}

export function extractDomainFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch (error) {
    return null;
  }
}

export function addToPersistentBlockedDomains(domain: string): void {
  const currentBlocked = loadPersistentBlockedDomains();
  if (!currentBlocked.includes(domain)) {
    currentBlocked.push(domain);
    savePersistentBlockedDomains(currentBlocked);
  }
}

// Error classification for smart domain blocking
export interface FetchErrorClassification {
  type: 'permanent_block' | 'session_block' | 'continue';
  reason: string;
  httpStatus?: number;
}

export function classifyFetchError(error: Error): FetchErrorClassification {
  const errorMessage = error.message.toLowerCase();
  
  // Extract HTTP status codes from common error patterns
  const httpStatusMatch = errorMessage.match(/(?:status|code|http)[\s:]*(\d{3})/);
  const httpStatus = httpStatusMatch ? parseInt(httpStatusMatch[1]) : undefined;
  
  // Permanent blocks - Only for explicit access restrictions
  if (httpStatus === 403) {
    return { type: 'permanent_block', reason: 'HTTP 403 Forbidden', httpStatus };
  }
  if (httpStatus === 401) {
    return { type: 'permanent_block', reason: 'HTTP 401 Unauthorized', httpStatus };
  }
  if (httpStatus === 429) {
    return { type: 'permanent_block', reason: 'HTTP 429 Rate Limited', httpStatus };
  }
  
  // Session blocks - Network issues that should not retry in current session
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return { type: 'session_block', reason: 'Network timeout' };
  }
  if (errorMessage.includes('enotfound') || errorMessage.includes('getaddrinfo failed')) {
    return { type: 'session_block', reason: 'DNS resolution failed' };
  }
  if (errorMessage.includes('econnrefused') || errorMessage.includes('connection refused')) {
    return { type: 'session_block', reason: 'Connection refused' };
  }
  if (errorMessage.includes('econnreset') || errorMessage.includes('connection reset')) {
    return { type: 'session_block', reason: 'Connection reset' };
  }
  if (errorMessage.includes('individual fetch timeout')) {
    return { type: 'session_block', reason: 'Fetch timeout' };
  }
  
  // Continue research - Other errors that shouldn't block domains
  return { type: 'continue', reason: 'Non-blocking error' };
}