// Research Agent - Core functionality for objective-driven research
// Local modules
import { executeClaudeCLI } from './claude-cli.js';
import { loadPersistentBlockedDomains, extractDomainFromUrl, addToPersistentBlockedDomains, classifyFetchError } from './domain-blocking.js';
import { enhancedContentExtraction, extractLinksWithPriority } from './helpers.js';
import { logger } from './logger.js';
import { ResearchAgentParams, ResearchAgentResult, ResearchState, ResearchObjective, ExtractedQuote, ObjectiveStatus, WebSearchParams, WebFetchParams, CombinedAnalysisResult } from './types.js';

// Research Agent - Combined Content Analysis and Query Planning using Claude CLI
export async function analyzeContentAndPlan(content: string, objectives: ResearchObjective[], sourceUrl: string, incompleteObjectives: ResearchObjective[]): Promise<CombinedAnalysisResult> {
  try {
    const objectivesList = objectives.map((obj, i) => `${i + 1}. ${obj.question}`).join('\n');
    const incompleteList = incompleteObjectives.map((obj, i) => `${obj.id}. ${obj.question}`).join('\n');
    
    const combinedPrompt = `You are a research assistant that extracts comprehensive information and plans next research steps. Analyze the provided content and return a JSON response with TWO parts:

1. EXTRACT QUOTES: Find multiple comprehensive quotes that captures all relevant information from this webpage
2. PLAN NEXT QUERY: Generate an intelligent next search query based on research gaps

Research Objectives:
${objectivesList}

Incomplete Objectives (need more research):
${incompleteList}

Content Source: ${sourceUrl}

Format your response as this exact JSON structure:
{
  "quotes": [
    {
      "quote": "comprehensive summary of all relevant information from this webpage",
      "objective_ids": ["1", "2"]
    }
  ],
  "next_query": "intelligent search query focusing on biggest research gaps"
}

QUOTE EXTRACTION GUIDELINES:
- Extract multiple comprehensive quotes that summarizes ALL relevant information from the webpage
- Include all key facts, features, capabilities, and details that answer the research objectives
- Combine multiple pieces of information into a single comprehensive summary
- Use empty array if no relevant information found

NEXT QUERY GUIDELINES:
- Focus on objectives that need more information
- Be specific and targeted, not generic
- Include relevant keywords and context
- Consider what information is still missing
Content:
${content.slice(0, 8000)}`;

    // Use Claude CLI with a normal prompt
    const result = await executeClaudeCLI({ prompt: combinedPrompt });
    
    if (!result.results) {
      return { extracted_quotes: [], next_query: "" };
    }

    // Parse the JSON response
    const responseText = result.results.toString();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      logger.error('No JSON object found in Claude response', 'analyzeContentAndPlan');
      return { extracted_quotes: [], next_query: "" };
    }

    const parsedResult = JSON.parse(jsonMatch[0]);
    
    // Convert quotes to ExtractedQuote format
    const extractedQuotes: ExtractedQuote[] = (parsedResult.quotes || []).map((q: any) => ({
      quote: q.quote,
      source_url: sourceUrl,
      objective_ids: q.objective_ids || [],
      timestamp: new Date().toISOString()
    }));

    return {
      extracted_quotes: extractedQuotes,
      next_query: parsedResult.next_query || ""
    };
  } catch (error) {
    logger.error('Error in combined content analysis and planning', 'analyzeContentAndPlan', error instanceof Error ? error : new Error(String(error)));
    return { extracted_quotes: [], next_query: "" };
  }
}

// Research State Management Functions
export function initializeResearchState(objectives: string[], startingQuery: string): ResearchState {
  const researchObjectives: ResearchObjective[] = objectives.map((q, i) => ({
    id: (i + 1).toString(),
    question: q,
    completed: false
  }));

  const objectiveStatus: ObjectiveStatus[] = researchObjectives.map(obj => ({
    objective_id: obj.id,
    completed: false,
    supporting_quotes: []
  }));

  // Load persistent blocked domains and merge with runtime failed domains
  const persistentBlocked = loadPersistentBlockedDomains();
  const initialFailedDomains = new Set<string>(persistentBlocked);
  
  

  return {
    objectives: researchObjectives,
    accumulated_quotes: [],
    objective_status: objectiveStatus,
    iteration_count: 0,
    source_tracker: new Set<string>(),
    failed_domains: initialFailedDomains,
    last_query: startingQuery
  };
}

export function saveExtractedQuotes(state: ResearchState, newQuotes: ExtractedQuote[]): void {
  // Add new quotes to accumulated quotes
  state.accumulated_quotes.push(...newQuotes);
  
  // Update objective status with new quotes
  for (const quote of newQuotes) {
    for (const objectiveId of quote.objective_ids) {
      const status = state.objective_status.find(s => s.objective_id === objectiveId);
      if (status) {
        status.supporting_quotes.push(quote);
        // Mark as completed if we have multiple quotes
        status.completed = status.supporting_quotes.length >= 2;
      }
    }
  }
  
  // Update research objectives completion status
  for (const objective of state.objectives) {
    const status = state.objective_status.find(s => s.objective_id === objective.id);
    if (status) {
      objective.completed = status.completed;
    }
  }

  
}

export function assessObjectiveCompletion(state: ResearchState): { allComplete: boolean; completionRate: number; incompleteObjectives: ResearchObjective[] } {
  const completed = state.objectives.filter(obj => obj.completed);
  const incomplete = state.objectives.filter(obj => !obj.completed);
  
  return {
    allComplete: completed.length === state.objectives.length,
    completionRate: completed.length / state.objectives.length,
    incompleteObjectives: incomplete
  };
}


export function deduplicateQuotes(quotes: ExtractedQuote[]): ExtractedQuote[] {
  const seen = new Set<string>();
  return quotes.filter(quote => {
    const key = `${quote.quote.slice(0, 100)}-${quote.source_url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Main Research Agent Implementation
export async function executeResearchAgent(params: ResearchAgentParams): Promise<ResearchAgentResult> {
  const maxCalls = params.max_calls || 5;
  const state = initializeResearchState(params.objectives, params.starting_query);
  
  let currentQuery = params.starting_query;
  let terminationReason: 'all_objectives_complete' | 'max_calls_reached' | 'no_new_information' = 'max_calls_reached';
  
  for (let iteration = 1; iteration <= maxCalls; iteration++) {
    
    state.iteration_count = iteration;
    
    try {
      // Step 1: Web search with updated blocked domains
      const combinedBlockedDomains = [
        ...(params.blocked_domains || []),
        ...Array.from(state.failed_domains)
      ];
      
      const searchParams: WebSearchParams = {
        query: currentQuery,
        allowed_domains: params.allowed_domains,
        blocked_domains: combinedBlockedDomains,
        auto_research: false
      };
      
      
      
      const searchParams2: any = { query: searchParams.query };
      
      if (searchParams.allowed_domains) {
        searchParams2.allowed_domains = searchParams.allowed_domains;
      }
      
      if (searchParams.blocked_domains) {
        searchParams2.blocked_domains = searchParams.blocked_domains;
      }
      
      const searchResult = await executeClaudeCLI({
        toolName: "web_search",
        allowedTools: "web_search",
        parameters: searchParams2
      });
      
      
      // Step 2: Auto-fetch top URLs
      const searchContent = searchResult.results || '';
      const priorityUrls = extractLinksWithPriority(searchContent, currentQuery, 3);
      
      if (priorityUrls.length === 0) {
        
        continue;
      }
      
      
      // Step 3: Parallel URL fetching and processing
      const fetchPromises = priorityUrls.map(async ({ url, score }) => {
        // Skip if we've already processed this source
        if (state.source_tracker.has(url)) {
          return null;
        }
        
        // Check if domain is in failed domains
        const domain = extractDomainFromUrl(url);
        if (domain && state.failed_domains.has(domain)) {
          return null;
        }
        
        try {
          const fetchParams: WebFetchParams = { url };
          
          // Use individual 120s timeout to match Claude CLI timeout
          const fetchResult = await Promise.race([
            executeClaudeCLI({
              toolName: "web_fetch",
              allowedTools: "WebFetch",
              parameters: { url: fetchParams.url }
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Individual fetch timeout')), 120000)
            )
          ]);
          
          if (fetchResult.results && typeof fetchResult.results === 'string') {
            const extracted = enhancedContentExtraction(fetchResult.results, url);
            
            // Only process if we got substantial content
            if (extracted.content.length > 500) {
              // Mark source as processed
              state.source_tracker.add(url);
              
              return {
                url,
                extracted,
                domain
              };
            } else {
              // Short content - just continue research, don't block domain
              logger.info(`Short content from ${domain}, continuing research`, 'executeResearchAgent');
              return null;
            }
          } else {
            // No fetch results - just continue research, don't block domain
            logger.info(`No results from ${domain}, continuing research`, 'executeResearchAgent');
            return null;
          }
        } catch (fetchError) {
          // Smart error classification for domain blocking
          if (domain && fetchError instanceof Error) {
            const classification = classifyFetchError(fetchError);
            
            switch (classification.type) {
              case 'permanent_block':
                // Only block permanently for explicit access restrictions (403/401/429)
                addToPersistentBlockedDomains(domain);
                logger.info(`Permanently blocked ${domain}: ${classification.reason}`, 'executeResearchAgent');
                break;
                
              case 'session_block':
                // Block for this session only for network issues
                state.failed_domains.add(domain);
                logger.info(`Session blocked ${domain}: ${classification.reason}`, 'executeResearchAgent');
                break;
                
              case 'continue':
                // Don't block domain, just continue research
                logger.info(`Continuing research despite error from ${domain}: ${classification.reason}`, 'executeResearchAgent');
                break;
            }
          }
          return null;
        }
      });

      // Wait for all fetches to complete
      const fetchResults = await Promise.allSettled(fetchPromises);
      const successfulFetches = fetchResults
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => (result as PromiseFulfilledResult<any>).value);

      // Process content analysis for successful fetches in parallel
      if (successfulFetches.length > 0) {
        const completion = assessObjectiveCompletion(state);
        
        const analysisPromises = successfulFetches.map(async ({ url, extracted }) => {
          try {
            const analysisResult = await analyzeContentAndPlan(
              extracted.content,
              state.objectives,
              url,
              completion.incompleteObjectives
            );
            return analysisResult;
          } catch (error) {
            logger.error(`Error analyzing content from ${url}`, 'executeResearchAgent', error instanceof Error ? error : new Error(String(error)));
            return { extracted_quotes: [], next_query: "" };
          }
        });

        const analysisResults = await Promise.allSettled(analysisPromises);
        
        // Collect quotes and next query suggestions
        let bestNextQuery = "";
        for (const result of analysisResults) {
          if (result.status === 'fulfilled') {
            const analysis = result.value;
            if (analysis.extracted_quotes.length > 0) {
              saveExtractedQuotes(state, analysis.extracted_quotes);
            }
            // Use the first non-empty next query suggestion
            if (analysis.next_query && !bestNextQuery) {
              bestNextQuery = analysis.next_query;
            }
          }
        }
        
        // Store the best next query suggestion
        if (bestNextQuery) {
          state.last_query = bestNextQuery;
        }
      }
      
      // Step 4: Assess completion
      const completion = assessObjectiveCompletion(state);
      
      
      if (completion.allComplete) {
        terminationReason = 'all_objectives_complete';
        
        break;
      }
      
      // Step 5: Use the intelligent query from combined analysis
      if (iteration < maxCalls && state.last_query) {
        currentQuery = state.last_query;
      }
      
    } catch (error) {
      
    }
  }
  
  // Deduplicate quotes before final result
  state.accumulated_quotes = deduplicateQuotes(state.accumulated_quotes);
  
  // Generate final summary
  const finalCompletion = assessObjectiveCompletion(state);
  const totalQuotes = state.accumulated_quotes.length;
  const sourcesCount = state.source_tracker.size;
  
  const finalSummary = `Research completed after ${state.iteration_count} iterations. ` +
    `Objectives completed: ${finalCompletion.completionRate * 100}% (${state.objectives.filter(o => o.completed).length}/${state.objectives.length}). ` +
    `Total quotes extracted: ${totalQuotes} from ${sourcesCount} sources.`;
  
  
  
  return {
    completed_objectives: state.objective_status,
    all_quotes: state.accumulated_quotes,
    iteration_count: state.iteration_count,
    termination_reason: terminationReason,
    final_summary: finalSummary
  };
}

// Format Research Agent Results
export function formatResearchAgentResults(result: ResearchAgentResult): string {
  const sections: string[] = [];
  
  // Header with summary
  sections.push(`# Research Agent Results\n`);
  sections.push(`**Final Summary:** ${result.final_summary}\n`);
  sections.push(`**Termination Reason:** ${result.termination_reason.replace(/_/g, ' ')}`);
  sections.push(`**Iterations Completed:** ${result.iteration_count}\n`);
  
  // Objectives Status
  sections.push(`## Objectives Status\n`);
  result.completed_objectives.forEach((obj, i) => {
    const statusIcon = obj.completed ? '✅' : '❌';
    sections.push(`${statusIcon} **Objective ${obj.objective_id}**: (${obj.supporting_quotes.length} quotes)`);
  });
  sections.push('');
  
  // All Extracted Quotes
  if (result.all_quotes.length > 0) {
    sections.push(`## Extracted Quotes (${result.all_quotes.length} total)\n`);
    
    // Group quotes by objective
    const quotesByObjective = new Map<string, ExtractedQuote[]>();
    result.all_quotes.forEach(quote => {
      quote.objective_ids.forEach(objId => {
        if (!quotesByObjective.has(objId)) {
          quotesByObjective.set(objId, []);
        }
        quotesByObjective.get(objId)!.push(quote);
      });
    });
    
    // Display quotes organized by objective
    quotesByObjective.forEach((quotes, objId) => {
      const objective = result.completed_objectives.find(o => o.objective_id === objId);
      sections.push(`### Objective ${objId} Quotes\n`);
      
      quotes.forEach((quote, i) => {
        sections.push(`**Quote ${i + 1}**`);
        sections.push(`Source: ${quote.source_url}`);
        sections.push(`> "${quote.quote}"`);
        sections.push('');
      });
    });
    
    // Also show any quotes that don't match specific objectives
    const unmatchedQuotes = result.all_quotes.filter(q => q.objective_ids.length === 0);
    if (unmatchedQuotes.length > 0) {
      sections.push(`### Additional Quotes\n`);
      unmatchedQuotes.forEach((quote, i) => {
        sections.push(`**Quote ${i + 1}**`);
        sections.push(`Source: ${quote.source_url}`);
        sections.push(`> "${quote.quote}"`);
        sections.push('');
      });
    }
  } else {
    sections.push(`## No Quotes Extracted\n`);
    sections.push('No relevant quotes were found during the research process.');
  }
  
  return sections.join('\n');
}