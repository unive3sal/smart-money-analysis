---
title: Agent Natural Language Copy Trading Interaction Specification
version: 1.0
date_created: 2026-04-13
last_updated: 2026-04-13
owner: universal
tags: [design, agent, natural-language, copy-trading, llm]
---

# Introduction

This specification defines the natural-language and agent-facing interaction model for the smart money copy trading platform. The goal is to let a user interact with the platform through conversational text to inspect traders, request analysis, configure follow behavior, start or stop copy trading, and query platform state through safe, structured, and confirmable intent handling.

## 1. Purpose & Scope

This specification covers the agent-related behavior for:

- Accepting natural-language user input for read and control actions.
- Resolving conversational input into explicit structured intents and extracted parameters.
- Supporting natural-language queries for top traders, trader analysis, strategy status, copy-trade session state, and recent decision history.
- Supporting natural-language control actions such as selecting traders, configuring strategy options, starting copy trading, and stopping copy trading.
- Requiring clarification or confirmation before unsafe, ambiguous, or state-changing actions proceed.
- Producing structured outputs that downstream platform services can evaluate safely.

Intended audience:

- Engineers implementing conversational interfaces, agent workflows, and natural-language orchestration.
- Engineers integrating LLM-driven intent resolution with platform backend services.
- Future Generative AI agents that need a precise contract for safe action translation.

Out of scope:

- Platform-native wallet, Telegram, or execution implementation details beyond the interaction boundary.
- LLM training or prompt-engineering internals.
- Trading strategy design independent of natural-language interaction.

Assumptions:

- The platform exposes canonical backend actions and identifiers for trader inspection, strategy management, and execution lifecycle control.
- Natural-language handling is an interaction layer above those canonical actions.
- State-changing operations require explicit confirmation.

## 2. Definitions

- **Natural-Language Interaction**: A user interaction mode where the user issues intent through conversational text.
- **Intent Resolution**: The process of mapping natural-language input into a structured platform action, query, or clarification requirement.
- **Clarification**: A follow-up question required when the system cannot safely determine a single intended action or required parameter set.
- **Confirmation Step**: An explicit user approval step required before a state-changing or execution-related action proceeds.
- **Read Action**: A non-state-changing request such as querying top traders, trader metrics, strategy status, or recent platform decisions.
- **Control Action**: A state-changing request such as selecting traders, updating strategy configuration, starting copy trading, or stopping copy trading.
- **Canonical Action**: A backend-recognized structured action used by non-conversational interfaces and the agent layer alike.
- **Extracted Parameters**: Structured values parsed from a user message, such as time window, trader identifier, strategy identifier, or filter setting.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The system shall support natural-language queries for read operations such as requesting top traders, trader analysis, trader metrics, follow strategy status, active session status, and recent copy-trade decisions.
- **REQ-002**: The system shall support natural-language commands for control operations such as selecting traders, creating or updating a follow strategy, starting copy trading, stopping copy trading, and querying current session state.
- **REQ-003**: The system shall resolve natural-language input into explicit structured intents with extracted parameters.
- **REQ-004**: The system shall map resolved intents to the same canonical action model used by non-conversational interfaces.
- **REQ-005**: The system shall support extracted parameters such as recent window, trader identifier, strategy identifier, channel scope, and TimesNet risk filter preference.
- **REQ-006**: The system shall require a confirmation step for natural-language commands that change state or can lead to execution-related behavior.
- **REQ-007**: The system shall support clarification when a user request is ambiguous, incomplete, or not safely executable.
- **REQ-008**: The system shall expose structured results from intent resolution, including intent type, extracted parameters, confidence, and whether clarification or confirmation is required.
- **REQ-009**: The system shall support natural-language requests that combine read and control stages, but must split them into safe structured actions before execution.
- **REQ-010**: The system shall preserve a machine-readable record of the resolved intent and resulting canonical action.
- **REQ-011**: The system shall support natural-language interaction for common operations such as "show top traders in the latest 12h", "analyze trader 42", "start copy trading trader 42 with TimesNet filter on", and "stop my active copy trade".
- **REQ-012**: The system shall expose structured summaries rather than unbounded free-form text when the result is intended for downstream action or audit.

- **SEC-001**: The system shall not allow ambiguous natural-language input to trigger state-changing or execution-related actions without clarification or confirmation.
- **SEC-002**: The system shall treat model-generated text as advisory and shall not allow free-form natural-language output to bypass canonical action validation.
- **SEC-003**: The system shall fail closed when intent resolution, parameter extraction, or action validation cannot be completed safely.
- **SEC-004**: The system shall preserve actor and timestamp metadata for confirmed control actions initiated through natural language.

- **CON-001**: Natural-language interaction must translate into the same canonical identifier and action model used by platform-native interfaces.
- **CON-002**: Intent resolution outputs must be structured and bounded.
- **CON-003**: Confirmation semantics must remain consistent across different conversational surfaces.
- **CON-004**: Clarification flows must prefer the minimum question set needed to reach a safe structured action.

- **GUD-001**: Prefer explicit intent types over inferred side effects.
- **GUD-002**: Prefer structured output fields over action-driving free-form prose.
- **GUD-003**: Prefer confirmation for start, stop, and strategy mutation commands even when intent confidence is high.
- **GUD-004**: Prefer separating read intent handling from control intent handling in the interaction pipeline.

- **PAT-001**: Use a dedicated intent-resolution layer that returns structured intent results.
- **PAT-002**: Use a confirmation gate between resolved control intents and backend execution.
- **PAT-003**: Use a clarification loop when required parameters or intent disambiguation are missing.

## 4. Interfaces & Data Contracts

### 4.1 Natural-Language Intent Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| intent_id | string | Yes | Unique intent identifier |
| raw_input | string | Yes | Original user natural-language input |
| intent_type | enum | Yes | `query_top_traders`, `query_trader_analysis`, `query_status`, `select_trader`, `configure_strategy`, `start_copy_trade`, `stop_copy_trade`, `other` |
| extracted_parameters | object | Yes | Structured parameters extracted from the input |
| confidence | number | No | Intent-resolution confidence |
| clarification_required | boolean | Yes | Whether additional user clarification is required |
| confirmation_required | boolean | Yes | Whether explicit user confirmation is required before execution |
| canonical_action | object | No | Structured backend action if resolution succeeded |
| resolved_at | string (ISO-8601) | Yes | Intent resolution timestamp |

### 4.2 Confirmation Request Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| confirmation_id | string | Yes | Unique confirmation identifier |
| intent_id | string | Yes | Related intent identifier |
| action_summary | string | Yes | Human-readable summary of the proposed action |
| canonical_action | object | Yes | Structured backend action awaiting approval |
| expires_at | string (ISO-8601) | No | Optional expiration time |
| created_at | string (ISO-8601) | Yes | Creation timestamp |

### 4.3 Example JSON

```json
{
  "intent_id": "intent_001",
  "raw_input": "show me the top traders from the last 12 hours and start copy trading trader_42 with timesnet filter on",
  "intent_type": "start_copy_trade",
  "extracted_parameters": {
    "window": "12h",
    "trader_ids": ["trader_42"],
    "timesnet_risk_filter_enabled": true
  },
  "clarification_required": false,
  "confirmation_required": true,
  "canonical_action": {
    "type": "start_copy_trade",
    "strategy_input": {
      "trader_ids": ["trader_42"],
      "timesnet_risk_filter_enabled": true
    }
  },
  "resolved_at": "2026-04-13T12:00:00Z"
}
```

## 5. Acceptance Criteria

- **AC-001**: Given a user asks in natural language for top traders in the latest `12h`, When the request is resolved successfully, Then the system returns the matching trader inspection results using the canonical query model.
- **AC-002**: Given a user asks in natural language for trader analysis, When normalized trader data exists, Then the system returns the structured analysis result for the requested trader scope.
- **AC-003**: Given a user issues a natural-language command to select traders or configure a strategy, When required parameters are present, Then the system resolves the command into a structured canonical action.
- **AC-004**: Given a user issues a natural-language command to start copy trading, When intent resolution succeeds, Then the system requires confirmation before the canonical start action is executed.
- **AC-005**: Given a user issues a natural-language manual stop command, When the stop command is confirmed, Then the system emits the canonical stop action and the platform may stop the active session.
- **AC-006**: Given a natural-language command is ambiguous for a state-changing action, When intent resolution cannot determine a safe structured action, Then the system requests clarification instead of executing the action.
- **AC-007**: Given a natural-language request combines read and control steps, When the system processes the request, Then it separates the request into safe structured operations before any state-changing action proceeds.

## 6. Test Automation Strategy

- **Test Levels**: Unit, Integration, End-to-End
- **Frameworks**: Use the repository’s existing application test stack and agent-integration test patterns.
- **Test Data Management**: Use deterministic fixtures for natural-language requests, resolved intents, extracted parameters, confirmation flows, and clarification cases.
- **CI/CD Integration**: Run intent-resolution, clarification, confirmation, and canonical-action mapping tests in automated CI pipelines.
- **Coverage Requirements**: Cover read intents, control intents, ambiguous input handling, missing-parameter clarification, confirmation gating, and fail-closed behavior.
- **Performance Testing**: Measure intent-resolution latency for common read and control requests under concurrent usage.
- **Automation Focus Areas**:
  - Validate correct resolution of top-trader queries.
  - Validate correct resolution of trader-analysis requests.
  - Validate confirmation gating for start and stop actions.
  - Validate clarification behavior for ambiguous trader references and incomplete commands.
  - Validate canonical action mapping and audit record creation.

## 7. Rationale & Context

Natural-language interaction is an agent-layer concern rather than a platform-core concern. The platform should expose canonical actions and contracts, while the agent layer safely translates human language into those actions. This separation reduces ambiguity inside the core trading platform and makes it easier to apply clarification, confirmation, and safety rules consistently. The primary safety rule is that natural-language convenience must never bypass explicit confirmation or canonical backend validation for state-changing behavior.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Smart money copy trading platform backend - Provides canonical actions and query surfaces consumed by the agent layer.

### Third-Party Services
- **SVC-001**: Natural-language understanding service - Resolves conversational input into structured intents and extracted parameters.
- **SVC-002**: LLM service - Produces bounded structured reasoning or summaries used during interaction flows.

### Infrastructure Dependencies
- **INF-001**: Conversation state store - Tracks pending clarification and confirmation state where needed.
- **INF-002**: Audit and observability system - Stores resolved intents and confirmed control actions.

### Data Dependencies
- **DAT-001**: Canonical trader, strategy, and session identifiers from the platform backend - Required for safe action translation.

### Technology Platform Dependencies
- **PLT-001**: Structured action schema shared with the platform backend - Required so agent output can be validated deterministically.

### Compliance Dependencies
- **COM-001**: Auditability of state-changing conversational commands - Required so confirmed natural-language actions can be reviewed later.

**Note**: This section focuses on interaction-layer capabilities rather than platform-core implementation details.

## 9. Examples & Edge Cases

```text
User: "Start copy trading trader 42"
System: confirmation required because this is a state-changing action.
```

```text
User: "Follow the top trader from today"
System: clarification required if multiple candidate traders match the implied scope or if the scope is not canonical.
```

Edge cases that must be handled:

- The user references a trader by display name that matches multiple traders.
- The user requests "start copy trading" without specifying traders or strategy details.
- The user combines a read request and a start command in one message.
- The user asks to stop trading when no active session exists.
- The LLM produces a persuasive narrative summary that does not map cleanly to a canonical action.

## 10. Validation Criteria

- The specification is satisfied only if natural-language requests can be mapped safely into canonical backend actions and queries.
- State-changing commands must require confirmation or clarification before execution.
- Ambiguous natural-language input must never trigger execution directly.
- Resolved intents and confirmed control actions must be auditable.

## 11. Related Specifications / Further Reading

- [spec-smart-money-copy-trading-platform.md](./spec-smart-money-copy-trading-platform.md)
