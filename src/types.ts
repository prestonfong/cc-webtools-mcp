// Type definitions and interfaces for the research workflow


export interface WebSearchParams {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
  auto_research?: boolean;
}

export interface WebFetchParams {
  url: string;
}

export interface ToolResult {
  query?: string;
  url?: string;
  results: string;
  raw_content: string;
  isError?: boolean;
}

// Research agent types
export interface ResearchObjective {
  id: string;
  question: string;
  completed: boolean;
}

export interface ExtractedQuote {
  quote: string;
  source_url: string;
  objective_ids: string[];
  timestamp: string;
}

export interface ObjectiveStatus {
  objective_id: string;
  completed: boolean;
  supporting_quotes: ExtractedQuote[];
}

export interface ResearchState {
  objectives: ResearchObjective[];
  accumulated_quotes: ExtractedQuote[];
  objective_status: ObjectiveStatus[];
  iteration_count: number;
  source_tracker: Set<string>;
  failed_domains: Set<string>;
  last_query: string;
}

export interface ResearchAgentParams {
  objectives: string[];
  starting_query: string;
  max_calls?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export interface CombinedAnalysisResult {
  extracted_quotes: ExtractedQuote[];
  next_query: string;
}

export interface ResearchAgentResult {
  completed_objectives: ObjectiveStatus[];
  all_quotes: ExtractedQuote[];
  iteration_count: number;
  termination_reason: 'all_objectives_complete' | 'max_calls_reached' | 'no_new_information';
  final_summary: string;
}