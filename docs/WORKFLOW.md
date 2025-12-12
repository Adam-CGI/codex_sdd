# Multi-Agent Development Workflow

This document describes the multi-agent workflow system implemented in the SDD (Spec-Driven Development) server.

## Overview

SDD implements a structured, multi-agent development workflow that formalizes the process from feature request to code deployment. Each agent has specific responsibilities and operates on tasks in specific states.

## The Agents

### 1. Planning Agent
**Role**: Creates feature specs and breaks them down into tasks

**Works on**:
- Tasks in "Backlog" status
- Tasks in "Needs Planning Update" status

**Capabilities**:
- `planning_create_spec` - Create new feature specifications
- `planning_breakdown_spec` - Break specs into tasks
- `planning_update_spec` - Update existing specs
- `planning_rebuild_index` - Rebuild backlog index

**Transitions to**: "Ready for Architecture Review"

### 2. Architect Agent
**Role**: Reviews tasks against architecture rules and patterns

**Works on**:
- Tasks in "Ready for Architecture Review" status

**Capabilities**:
- `arch_validate_spec` - Validate specs against architecture rules
- `arch_annotate_spec_and_tasks` - Add architectural notes
- `tasks_update` - Update task metadata

**Transitions to**:
- "Ready for Coding" (if approved)
- "Needs Planning Update" (if rejected)

### 3. Coding Agent
**Role**: Implements tasks, writes code and tests

**Works on**:
- Tasks in "Ready for Coding" status
- Tasks in "In Progress" status

**Capabilities**:
- `coding_start_task` - Begin working on a task
- `coding_suggest_next_step` - Get implementation guidance
- `coding_update_task_status` - Update task progress
- `git_status`, `git_create_branch`, `git_stage_and_commit` - Git operations

**Transitions to**: "Ready for Code Review"

### 4. Code Review Agent
**Role**: Reviews code for quality, security, and compliance

**Works on**:
- Tasks in "Ready for Code Review" status

**Capabilities**:
- `review_analyze_diff` - Analyze git diffs
- `review_write_review_doc` - Write review documents
- `review_summarize_task_reviews` - Summarize all reviews
- `tasks_update` - Update task metadata

**Transitions to**:
- "Done" (if approved)
- "In Progress" (if changes requested)

### 5. Git Manager
**Role**: Manages git operations, branches, and PRs

**Works on**: Any task with git operations needed

**Capabilities**:
- `git_status` - Check git status
- `git_create_branch` - Create feature branches
- `git_stage_and_commit` - Stage and commit changes
- `git_push` - Push to remote
- `git_open_pr` - Open pull requests

## Workflow States

The workflow enforces specific state transitions:

```
Backlog
  ↓
Ready for Architecture Review
  ↓ (approved)        ↓ (rejected)
Ready for Coding      Needs Planning Update
  ↓                        ↓
In Progress          (back to arch review)
  ↓
Ready for Code Review
  ↓ (approved)        ↓ (changes needed)
Done                 In Progress
```

## Using the Workflow

### CLI Commands

#### View Agent Work Queues
```bash
# Show work queue for a specific agent
sdd workflow queue planning
sdd workflow queue architect
sdd workflow queue coding
sdd workflow queue review

# Interactive selection
sdd workflow queue
```

#### View Agent Information
```bash
# List all agents and their capabilities
sdd workflow agents
```

#### View Workflow Diagram
```bash
# Show the workflow flow
sdd workflow flow
```

### MCP Tools

#### Query Work for an Agent
```json
{
  "tool": "agent_query_work_queue",
  "arguments": {
    "agent_role": "architect",
    "limit": 10
  }
}
```

#### Get Agent Context for a Task
```json
{
  "tool": "agent_get_context",
  "arguments": {
    "agent_role": "coding",
    "task_id": "task-001"
  }
}
```

### Workflow Automation Tools

#### Architecture Review
```json
{
  "tool": "workflow_architecture_review",
  "arguments": {
    "task_id": "task-001",
    "approve": true,
    "notes": "Architecture looks good, follows our layering patterns"
  }
}
```

#### Start Coding
```json
{
  "tool": "workflow_start_coding",
  "arguments": {
    "task_id": "task-001",
    "create_branch": true,
    "branch_name": "feature/task-001"
  }
}
```

#### Submit for Review
```json
{
  "tool": "workflow_submit_for_review",
  "arguments": {
    "task_id": "task-001",
    "commit_message": "Implement feature X with tests"
  }
}
```

#### Code Review
```json
{
  "tool": "workflow_code_review",
  "arguments": {
    "task_id": "task-001",
    "approve": true,
    "notes": "Code looks great, tests pass",
    "open_pr": true
  }
}
```

## Example Workflow

### 1. Create a Feature Request

Using Planning Agent:
```bash
sdd task create "Add search functionality"
```

Or via MCP:
```json
{
  "tool": "planning_create_spec",
  "arguments": {
    "feature_name": "Search Functionality",
    "requirements_text": "Users should be able to search tasks, docs, and decisions"
  }
}
```

### 2. Break Down into Tasks

Planning Agent breaks the spec into tasks:
```json
{
  "tool": "planning_breakdown_spec",
  "arguments": {
    "spec_path": "specs/feature-search.md"
  }
}
```

Tasks are created in "Backlog" and moved to "Ready for Architecture Review"

### 3. Architecture Review

Architect Agent reviews:
```json
{
  "tool": "workflow_architecture_review",
  "arguments": {
    "task_id": "task-015",
    "approve": true,
    "notes": "Search design aligns with our query patterns"
  }
}
```

Task moves to "Ready for Coding"

### 4. Implementation

Coding Agent starts work:
```json
{
  "tool": "workflow_start_coding",
  "arguments": {
    "task_id": "task-015",
    "create_branch": true
  }
}
```

Task moves to "In Progress", branch created.

Agent implements changes, then:
```json
{
  "tool": "workflow_submit_for_review",
  "arguments": {
    "task_id": "task-015",
    "commit_message": "Add search functionality with tests"
  }
}
```

Task moves to "Ready for Code Review"

### 5. Code Review

Review Agent checks the code:
```json
{
  "tool": "workflow_code_review",
  "arguments": {
    "task_id": "task-015",
    "approve": true,
    "notes": "Implementation looks solid, all tests pass",
    "open_pr": true
  }
}
```

Task moves to "Done", PR is opened

## Configuration

The workflow is configured in `/backlog/config.yaml`:

```yaml
schema_version: "3.0"

statuses:
  - Backlog
  - Ready for Architecture Review
  - Needs Planning Update
  - Ready for Coding
  - In Progress
  - Ready for Code Review
  - Done

in_progress_statuses:
  - In Progress

transitions:
  Backlog: ["Ready for Architecture Review"]
  "Ready for Architecture Review": ["Backlog", "Ready for Coding", "Needs Planning Update"]
  "Needs Planning Update": ["Ready for Architecture Review"]
  "Ready for Coding": ["In Progress", "Backlog"]
  "In Progress": ["Ready for Code Review", "Backlog"]
  "Ready for Code Review": ["In Progress", "Done", "Backlog"]
  Done: ["Backlog"]
```

## Benefits

1. **Clear Ownership**: Each agent has specific responsibilities
2. **Quality Gates**: Tasks must pass architecture and code review
3. **Auditable**: All transitions and reviews are recorded
4. **Structured**: Enforces best practices through state transitions
5. **Collaborative**: Multiple agents can work together on complex features
6. **Traceable**: Full history of decisions and changes

## Next Steps

- Implement automated architecture rule checking
- Add more sophisticated code review heuristics
- Integrate with CI/CD pipelines
- Add metrics and analytics for workflow efficiency
