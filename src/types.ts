// Type definitions and interfaces for the research workflow

export interface ResearchStep {
  stepNumber?: number;
  action: 'search' | 'fetch' | 'analyze' | 'synthesize' | 'refine_query' | 'assess_completeness' | 'auto_fetch';
  query?: string;
  url?: string;
  content?: string;
  relevanceScore?: number;
  informationGathered?: string[];
  needsMoreResearch?: boolean;
  callCount?: number;
  timestamp: string;
  information?: string;
}


export interface WebSearchParams {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
  session_id?: string;
  auto_research?: boolean;
}

export interface WebFetchParams {
  url: string;
  session_id?: string;
}

export interface ToolResult {
  query?: string;
  url?: string;
  results: string;
  raw_content: string;
  isError?: boolean;
}

export interface ResearchStepParams {
  action: 'search' | 'fetch' | 'analyze' | 'synthesize' | 'refine_query' | 'assess_completeness';
  query_or_url: string;
  step_reasoning: string;
  next_step_needed: boolean;
  step_number: number;
  session_id: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
  previous_findings?: string;
  max_cycles?: number;
  cycle_detection_window?: number;
}

export type InformationCompleteness = 'insufficient' | 'partial' | 'sufficient' | 'complete';