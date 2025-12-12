---
id: feature-search
title: Task Search and Filtering
schema_version: "3.0"
status: draft
created: 2025-12-11
---

## Overview

Implement comprehensive search and filtering capabilities for tasks in the MCP Kanban system, allowing users to quickly find tasks by various criteria.

## Goals

- Enable full-text search across task titles, descriptions, and content
- Support filtering by status, assignee, labels, and other metadata
- Provide efficient search performance even with large backlogs
- Return results with relevance scoring

## Non-Goals

- Advanced natural language query parsing
- Search history or saved searches
- Cross-repository search

## Requirements

### Functional Requirements

1. **FR-1**: Search by text query across task title and sections
2. **FR-2**: Filter by status (single or multiple statuses)
3. **FR-3**: Filter by assignee
4. **FR-4**: Filter by spec reference
5. **FR-5**: Combine filters with AND logic
6. **FR-6**: Return paginated results
7. **FR-7**: Sort results by relevance or metadata (created date, status)

### Non-Functional Requirements

1. **NFR-1**: Search should complete within 500ms for backlogs up to 1000 tasks
2. **NFR-2**: Case-insensitive text matching
3. **NFR-3**: Support partial word matching

## Design

### API Design

```typescript
interface SearchTasksParams {
  query?: string;              // Text search query
  status?: string[];           // Filter by status
  assignee?: string;           // Filter by assignee
  spec?: string;               // Filter by spec reference
  labels?: string[];           // Filter by labels
  limit?: number;              // Results per page (default: 20)
  offset?: number;             // Pagination offset
  sort_by?: 'relevance' | 'created' | 'updated' | 'status';
  sort_order?: 'asc' | 'desc';
}

interface SearchTasksResult {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    assignee?: string;
    spec?: string;
    created?: string;
    relevance_score?: number;
    excerpt?: string;  // Matching text snippet
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

### Implementation Notes

- Use in-memory search for simplicity (no external search engine)
- Implement scoring based on:
  - Title matches (higher weight)
  - Section content matches
  - Exact vs partial matches
- Use backlog index.json for fast initial filtering
- Load full task content only for matching results

## Acceptance Criteria

- [ ] AC-1: Can search for tasks by text in title
- [ ] AC-2: Can search for tasks by text in description
- [ ] AC-3: Can filter by single status
- [ ] AC-4: Can filter by multiple statuses
- [ ] AC-5: Can filter by assignee
- [ ] AC-6: Can combine text search with filters
- [ ] AC-7: Returns paginated results
- [ ] AC-8: Returns relevance score for each result
- [ ] AC-9: Returns text excerpt showing match context
- [ ] AC-10: Search is case-insensitive
- [ ] AC-11: Handles empty results gracefully
- [ ] AC-12: Validates filter parameters

## Testing Strategy

- Unit tests for search scoring algorithm
- Unit tests for each filter type
- Integration tests with sample backlog
- Performance tests with 100+ tasks

## Dependencies

- Requires: task-store.ts, backlog index
- Blocks: None

## Risks & Mitigations

**Risk**: Poor performance with large backlogs
- **Mitigation**: Use index for pre-filtering, implement result limits

**Risk**: Complex query combinations
- **Mitigation**: Start with simple AND logic, iterate based on usage
