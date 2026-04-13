---
title: Smart Money Copy Trading Platform Specification
version: 1.0
date_created: 2026-04-13
last_updated: 2026-04-13
owner: universal
tags: [architecture, design, smart-money, copy-trading, timesnet, polymarket, telegram, wallet]
---

# Introduction

This specification defines the end-to-end smart money copy trading platform for the smart-money-analysis project. The platform supports trader discovery, trader analysis, trader selection, follow strategy configuration, automated copy trading, TimesNet-based transaction risk gating, LLM-assisted trader interpretation, wallet-extension and Telegram interaction channels, vault-based trading support, withdrawals, explicit stop controls, and data export pipelines required for model training and evaluation.

## 1. Purpose & Scope

This specification covers the core platform behavior for:

- Fetching and normalizing recent top trader data from external trader-activity sources, including Polymarket as an initial source.
- Exporting normalized Polymarket market, trader, order, and transaction datasets for TimesNet training, evaluation, and offline analysis.
- Building time-series feature sets and labeled training examples from exported activity data.
- Inspecting top traders by time window and field.
- Generating trader analysis from normalized trader and transaction data.
- Allowing users to select one or more traders to follow.
- Configuring follow strategy, copy-trade sizing, risk controls, and TimesNet transaction risk filtering.
- Using LLM-assisted summaries or explanations for trader analysis and copy-trade decision presentation.
- Starting, running, and stopping copy-trade sessions.
- Automatically copying eligible transactions from selected traders.
- Blocking copy execution when TimesNet classifies a candidate transaction as high risk.
- Supporting wallet-extension and Telegram channels on a common backend model.
- Supporting wallet vault operations and withdrawal workflows required for channel-based trading.

Intended audience:

- Engineers implementing ingestion, analytics, model integration, execution orchestration, and channel adapters.
- Engineers implementing Telegram and wallet-extension flows.
- Future Generative AI agents that need a precise platform contract.

Out of scope:

- Exchange-specific or chain-specific SDK implementation details.
- LLM model training internals.
- TimesNet architecture internals.
- Financial, tax, or legal advice.

Assumptions:

- The platform can retrieve recent trader rankings and transaction histories.
- Polymarket exports can provide enough market-state and trader-activity detail to derive repeatable training datasets.
- TimesNet inference is available through an internal scoring boundary.
- LLM inference is available for explanation, summarization, or operator-facing interpretation, but not as the sole execution gate.
- Trading actions require an explicit user-controlled authorization path.
- Channel adapters use the same backend identifiers and state transitions.

## 2. Definitions

- **Top Trader**: A trader ranked highly within a selected time window using one or more metrics such as profit and loss, return on investment, win rate, or volume.
- **Field**: A logical market category such as `crypto`, `sport`, `finance`, or `other`.
- **Recent Window**: A bounded time range such as `12h`, `24h`, `7d`, or `30d`.
- **Trader Analysis**: A structured result derived from normalized trader data and normalized transaction history.
- **Polymarket Export**: A reproducible dataset extract containing market metadata, trader activity, and transaction events sourced from Polymarket and normalized for downstream use.
- **Training Dataset**: A versioned collection of normalized records, features, labels, and metadata used for model training, evaluation, or backtesting.
- **Feature Window**: The bounded lookback interval used to derive model input features from sequential market and trader activity.
- **Prediction Horizon**: The bounded future interval over which a label or target outcome is computed.
- **LLM Explanation Layer**: A non-authoritative language-model component that explains trader behavior, model outputs, or copy-trade decisions for users and operators.
- **Follow Strategy**: User-configured rules controlling which traders are followed and how copied trades are sized, filtered, authorized, and stopped.
- **Copy Trade Session**: The active runtime state for automated copy trading under a specific strategy.
- **Candidate Transaction**: A new source transaction emitted by a followed trader and evaluated for copy execution.
- **TimesNet Risk Filter**: A transaction-level gating step that evaluates whether a candidate copied transaction is too risky to execute.
- **Wallet Extension**: A browser wallet provider used to authorize or originate trading actions.
- **Telegram Channel**: A Telegram bot interaction surface used for trader inspection, strategy management, vault operations, and copy-trade controls.
- **Wallet Vault**: A protected wallet-management capability used to hold or reference execution authority under controlled policy.
- **Stop Strategy**: Auto-stop rules such as drawdown threshold, exposure threshold, inactivity threshold, or profit target.
- **Manual Stop**: A user action that immediately stops new copy-trade execution.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The platform shall retrieve top trader data for supported recent windows including at minimum `12h`, `24h`, `7d`, and `30d`.
- **REQ-002**: The platform shall support grouping and querying trader information by field, including at minimum `crypto`, `sport`, and `finance`.
- **REQ-003**: The platform shall normalize trader and transaction data into stable internal schemas independent of upstream response shape.
- **REQ-004**: The platform shall persist trader summary data and transaction-level data for analytics, strategy setup, runtime decisioning, and model-training export.
- **REQ-005**: The platform shall expose trader metrics needed for selection, including at minimum rank, win rate, profit and loss, return on investment where available, position information where available, and recent transaction history.
- **REQ-006**: The platform shall generate structured trader analysis from normalized trader data and normalized transaction history.
- **REQ-007**: The platform shall support TimesNet-assisted scoring for candidate transaction gating.
- **REQ-008**: The platform shall allow a user to choose one or more traders to follow.
- **REQ-009**: The platform shall allow the user to configure a follow strategy before copy trading starts.
- **REQ-010**: The follow strategy shall support sizing rules, maximum exposure, stop strategy rules, take-profit and stop-loss controls where enabled, and whether TimesNet risk filtering is enabled.
- **REQ-011**: The platform shall require explicit user action to start copy trading.
- **REQ-012**: The platform shall create an active copy-trade session only after trader selection, strategy configuration, and required authorization are complete.
- **REQ-013**: The platform shall monitor followed traders for new candidate transactions while a copy-trade session is active.
- **REQ-014**: The platform shall evaluate every candidate transaction before any copy execution occurs.
- **REQ-015**: When TimesNet risk filtering is enabled, the platform shall score each candidate transaction before execution.
- **REQ-016**: The platform shall not copy a candidate transaction when TimesNet classifies it as high risk.
- **REQ-017**: The platform shall automatically copy eligible candidate transactions when the session is active and all strategy, authorization, and risk gates pass.
- **REQ-018**: The platform shall continue monitoring and evaluating candidate transactions until a stop strategy becomes active or the user manually stops the session.
- **REQ-019**: The platform shall stop new copy execution immediately after a manual stop is received.
- **REQ-020**: The platform shall stop new copy execution when a configured stop strategy becomes active.
- **REQ-021**: The platform shall support at least two user channels: `wallet_extension` and `telegram`.
- **REQ-022**: Both channels shall use a common backend capability set for trader inspection, follow strategy management, execution orchestration, and operator-facing model explanations.
- **REQ-023**: The wallet extension channel shall require wallet-based authorization for trading actions unless an explicitly user-approved session policy is active.
- **REQ-024**: The Telegram channel shall support top trader inspection workflows, follow strategy management, copy-trade controls, vault status inspection, and withdrawal initiation.
- **REQ-025**: The platform shall normalize follow strategy settings so they can be created in one channel and read or updated in the other channel.
- **REQ-026**: The platform shall support wallet vault operations required to enable bot-driven or channel-mediated trading.
- **REQ-027**: The platform shall support withdrawal initiation from a wallet vault to a user-controlled wallet address.
- **REQ-028**: The platform shall expose withdrawal status and recent withdrawal history through a channel-safe response.
- **REQ-029**: The platform shall record each candidate transaction decision, including source trader, source transaction, strategy result, TimesNet result, and final action.
- **REQ-030**: The platform shall record lifecycle events including strategy creation, session start, pause, stop, failure, withdrawal initiation, and authorization outcome.
- **REQ-031**: The platform shall preserve sufficient observability and audit data to reconstruct the workflow from trader inspection through stop or withdrawal.
- **REQ-032**: The platform shall support idempotent ingestion and idempotent candidate-transaction decisioning.
- **REQ-033**: The platform shall support reproducible export of normalized Polymarket datasets for offline TimesNet training, validation, and backtesting.
- **REQ-034**: Each export shall include enough market, trader, transaction, and temporal context to reconstruct ordered time-series examples without re-querying the upstream source.
- **REQ-035**: The platform shall derive versioned feature datasets for TimesNet from normalized event data using explicit feature-window and prediction-horizon definitions.
- **REQ-036**: The TimesNet training dataset shall support transaction-level labels for at minimum `favorable`, `unfavorable`, and `neutral_or_unresolved` outcomes over a defined prediction horizon.
- **REQ-037**: The platform shall retain export metadata including source, extraction window, schema version, feature version, label version, and generation timestamp.
- **REQ-038**: The platform shall support deterministic regeneration of the same export when the same source interval, schema version, and feature logic are used.
- **REQ-039**: The platform shall support an LLM explanation layer for trader summaries and decision explanations, but the LLM output must not override explicit authorization, strategy, or TimesNet risk-gating rules.
- **REQ-040**: The platform shall expose model-training readiness indicators, including missing-data rate, label coverage, and feature completeness for each export batch.

- **SEC-001**: The platform shall never execute a copied transaction unless the user explicitly started a copy-trade session.
- **SEC-002**: The platform shall validate all external trader and transaction data before using it for analysis, TimesNet scoring, training export, or execution decisions.
- **SEC-003**: The platform shall separate read-only ingestion credentials from execution credentials when execution is supported.
- **SEC-004**: The platform shall verify ownership or control of a wallet session before accepting wallet-extension-originated trading requests.
- **SEC-005**: The platform shall treat Telegram as an untrusted transport and require server-side validation for all bot commands and callback actions.
- **SEC-006**: The platform shall protect wallet vault secret material and shall not expose secrets in Telegram messages, logs, client responses, or model-training exports.
- **SEC-007**: The platform shall validate withdrawal destination format and enforce vault withdrawal policy before approving a withdrawal.
- **SEC-008**: The platform shall fail closed for candidate transaction execution: if validation, strategy checks, authorization, or TimesNet scoring cannot be completed, the candidate transaction must not be copied.
- **SEC-009**: The platform shall log sensitive actions with actor, channel, timestamp, and outcome metadata.
- **SEC-010**: Training exports shall exclude secrets, authentication artifacts, private keys, raw wallet-signature payloads, and non-essential personally identifiable information.
- **SEC-011**: The platform shall preserve provenance for each exported record so downstream model training can distinguish observed source facts from derived labels and LLM-generated annotations.

- **CON-001**: Canonical trader, transaction, strategy, session, and wallet references must be used across ingestion, analysis, configuration, execution, channel surfaces, and training exports.
- **CON-002**: Upstream trader-source adapters must isolate API volatility from core platform logic.
- **CON-003**: TimesNet inference latency must remain low enough for transaction gating to stay relevant.
- **CON-004**: Telegram interactions must tolerate message-length and button-layout limits.
- **CON-005**: Wallet-extension flows must tolerate disconnect, signature rejection, and session cancellation.
- **CON-006**: Stop behavior must remain actionable even when monitoring or scoring subsystems are degraded.
- **CON-007**: Duplicate source transaction events must not create duplicate copy execution.
- **CON-008**: Training labels must be generated from explicitly defined horizon rules and must not depend on future data beyond the declared prediction horizon.
- **CON-009**: Feature generation must be causal for online decisioning use cases; no feature may depend on information unavailable at the candidate transaction timestamp.
- **CON-010**: LLM-generated explanations are advisory artifacts and must not be treated as source-of-truth market data or labels.

- **GUD-001**: Prefer a staged workflow: inspect, analyze, select, configure, start, monitor, stop.
- **GUD-002**: Prefer explicit status fields over inferred state.
- **GUD-003**: Prefer append-only event records for strategy lifecycle and candidate transaction outcomes.
- **GUD-004**: Prefer channel-agnostic backend services with thin wallet-extension and Telegram adapters.
- **GUD-005**: Prefer structured decision outputs that can be rendered and audited consistently.
- **GUD-006**: Prefer training datasets that separate raw observations, derived features, and derived labels into explicitly versioned layers.
- **GUD-007**: Prefer monetary and quantity fields stored as precise decimal strings or fixed-point values in exported datasets to avoid floating-point drift.

- **PAT-001**: Use a dedicated external trader-source adapter layer.
- **PAT-002**: Use a feature and analysis layer that transforms raw trader activity into analysis-ready and model-ready structures.
- **PAT-003**: Use a candidate-transaction decision layer that combines strategy rules, authorization checks, and TimesNet risk gating before execution.
- **PAT-004**: Use a session-state model that makes `pending_start`, `active`, `stopping`, `stopped`, and `failed` explicit.
- **PAT-005**: Use a wallet vault service boundary so channel-facing code never handles raw secret material directly.
- **PAT-006**: Use separate export contracts for raw normalized records, feature windows, and supervised labels.

## 4. Interfaces & Data Contracts

**Note**: Detailed TimesNet training-data and Polymarket export contracts are defined in [spec-data-timesnet-training-schema.md](./spec-data-timesnet-training-schema.md). This platform specification references those contracts and only retains interfaces directly required by product and runtime copy-trading behavior.

### 4.1 Trader Summary Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| trader_id | string | Yes | Stable internal trader identifier |
| source_trader_id | string | Yes | Upstream trader identifier |
| display_name | string | No | Trader display name if available |
| field | enum | Yes | One of `crypto`, `sport`, `finance`, `other` |
| window | enum | Yes | One of `12h`, `24h`, `7d`, `30d` |
| rank | integer | Yes | Rank within field and window |
| pnl | number | No | Profit and loss for the ranking window |
| roi | number | No | Return on investment for the ranking window |
| volume | number | No | Trading volume metric |
| win_rate | number | No | Win-rate metric where available |
| trade_count | integer | No | Number of trades in the window |
| snapshot_at | string (ISO-8601) | Yes | Time the ranking snapshot was captured |
| raw_source | object | Yes | Original payload for traceability |

### 4.2 Trader Analysis Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| analysis_id | string | Yes | Unique analysis identifier |
| trader_id | string | Yes | Trader being analyzed |
| window | enum | Yes | Analysis scope window |
| summary | object | Yes | Structured analysis findings |
| strengths | array | No | Positive structured signals |
| risks | array | No | Negative structured signals |
| confidence | number | No | Confidence or quality score if available |
| llm_explanation | object | No | Optional explanation payload generated for user-facing interpretation |
| generated_at | string (ISO-8601) | Yes | Analysis timestamp |

### 4.3 Follow Strategy Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| strategy_id | string | Yes | Unique follow strategy identifier |
| user_id | string | Yes | Owner of the strategy |
| trader_ids | array<string> | Yes | Traders included in the strategy |
| channel_created_from | enum | Yes | `wallet_extension` or `telegram` |
| status | enum | Yes | `draft`, `ready`, `active`, `paused`, `stopped`, `pending_confirmation` |
| sizing_mode | enum | Yes | Strategy sizing mode |
| sizing_value | number | No | Size parameter for the selected mode |
| max_exposure | number | No | Maximum total exposure allowed |
| stop_strategy | object | Yes | Auto-stop rules and thresholds |
| stop_loss | object | No | Stop-loss configuration where enabled |
| take_profit | object | No | Take-profit configuration where enabled |
| timesnet_risk_filter_enabled | boolean | Yes | Whether candidate transactions are gated by TimesNet |
| llm_explanation_enabled | boolean | Yes | Whether LLM explanations are generated for user-facing summaries and decisions |
| execution_wallet_ref | string | No | Wallet or vault profile used for execution |
| created_at | string (ISO-8601) | Yes | Creation timestamp |
| updated_at | string (ISO-8601) | Yes | Last update timestamp |

### 4.4 Copy Trade Session Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| session_id | string | Yes | Unique copy-trade session identifier |
| strategy_id | string | Yes | Strategy used by the session |
| selected_trader_ids | array<string> | Yes | Traders currently being followed |
| state | enum | Yes | `pending_start`, `active`, `stopping`, `stopped`, `failed` |
| started_at | string (ISO-8601) | No | Session start timestamp |
| stopped_at | string (ISO-8601) | No | Session stop timestamp |
| stop_reason | enum | No | `manual`, `stop_strategy`, `system_failure`, `other` |
| last_timesnet_inference_at | string (ISO-8601) | No | Most recent TimesNet decision timestamp |
| created_at | string (ISO-8601) | Yes | Creation timestamp |
| updated_at | string (ISO-8601) | Yes | Last update timestamp |

### 4.5 Candidate Transaction Decision Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| decision_id | string | Yes | Unique decision identifier |
| session_id | string | Yes | Active copy-trade session |
| source_transaction_id | string | Yes | Source trader transaction identifier |
| trader_id | string | Yes | Trader that emitted the transaction |
| strategy_result | object | Yes | Result of non-model strategy checks |
| timesnet_risk_result | object | No | Risk filter result when enabled |
| llm_explanation_result | object | No | Optional explanation payload for user-facing rationale |
| authorization_result | object | No | Execution authorization result |
| final_action | enum | Yes | `copied`, `blocked_high_risk`, `blocked_strategy`, `blocked_authorization`, `skipped`, `error` |
| copied_order_ref | string | No | Reference to created copied order if any |
| decided_at | string (ISO-8601) | Yes | Decision timestamp |

### 4.6 Channel Session Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| session_id | string | Yes | Unique session identifier |
| user_id | string | Yes | Internal user identifier |
| channel | enum | Yes | `wallet_extension` or `telegram` |
| channel_user_ref | string | Yes | External channel identity such as wallet address or Telegram user/chat reference |
| status | enum | Yes | `active`, `expired`, `revoked`, `pending` |
| authorized_for_trading | boolean | Yes | Whether the session currently permits trading actions |
| created_at | string (ISO-8601) | Yes | Creation timestamp |
| updated_at | string (ISO-8601) | Yes | Last update timestamp |

### 4.7 Wallet Vault Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| vault_ref | string | Yes | Unique vault or wallet profile reference |
| user_id | string | Yes | Owner of the vault profile |
| vault_type | enum | Yes | `custodial`, `delegated`, `linked_wallet`, `other` |
| status | enum | Yes | `active`, `locked`, `disabled`, `pending_setup` |
| allowed_actions | array | Yes | Allowed operations such as inspect, trade, withdraw, rotate |
| withdrawal_policy | object | No | Policy limits and destination constraints |
| policy_summary | object | Yes | High-level policy metadata safe to return to clients |
| created_at | string (ISO-8601) | Yes | Creation timestamp |
| updated_at | string (ISO-8601) | Yes | Last update timestamp |

### 4.8 Execution Authorization Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| authorization_id | string | Yes | Unique authorization identifier |
| user_id | string | Yes | Internal user identifier |
| channel | enum | Yes | `wallet_extension` or `telegram` |
| strategy_id | string | No | Related follow strategy if applicable |
| execution_wallet_ref | string | Yes | Wallet or vault reference used for execution |
| authorization_mode | enum | Yes | `wallet_signature`, `vault_policy`, `manual_confirm` |
| status | enum | Yes | `approved`, `rejected`, `expired`, `pending` |
| scope | object | Yes | Operations and limits allowed by this authorization |
| authorized_at | string (ISO-8601) | No | Approval timestamp |
| expires_at | string (ISO-8601) | No | Expiration timestamp |

### 4.9 Withdrawal Request Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| withdrawal_request_id | string | Yes | Unique withdrawal request identifier |
| user_id | string | Yes | Internal user identifier |
| channel | enum | Yes | `telegram` or `wallet_extension` |
| vault_ref | string | Yes | Source vault or wallet profile |
| asset_symbol | string | Yes | Asset being withdrawn |
| amount | number | Yes | Requested withdrawal amount |
| destination_address | string | Yes | User wallet destination address |
| destination_summary | string | Yes | Masked destination shown in confirmations |
| status | enum | Yes | `pending_confirmation`, `approved`, `submitted`, `failed`, `completed`, `rejected` |
| policy_check_result | object | Yes | Structured policy validation result |
| created_at | string (ISO-8601) | Yes | Creation timestamp |
| updated_at | string (ISO-8601) | Yes | Last update timestamp |

### 4.10 Telegram Command Contract

| Command / Action | Type | Required | Description |
| --- | --- | --- | --- |
| `/start` | slash command | Yes | Start bot session and show available actions |
| `/help` | slash command | Yes | Return supported command summary |
| `/top [scope]` | slash command | Yes | Show top traders for a timeframe or market scope |
| `/trader <trader_id>` | slash command | Yes | Show detailed inspection for one trader |
| `/follow <trader_id>` | slash command | Yes | Start copy-trade setup for a trader |
| `/following` | slash command | Yes | List active and paused follow strategies |
| `/vault` | slash command | Yes | Show wallet vault status and available profiles |
| `/withdraw` | slash command | Yes | Start asset withdrawal from vault to user wallet |
| `/copytrade stop <trader_id|all>` | slash command | Yes | Disable live copy trading for one trader or all |
| `inspect_trader:<trader_id>` | callback action | Yes | Open trader inspection from inline buttons |
| `follow_trader:<trader_id>` | callback action | Yes | Open copy-trade setup flow from inline buttons |

## 5. Acceptance Criteria

- **AC-001**: Given recent trader ranking data is available, When the user inspects top traders for the latest `12h`, Then the platform returns traders with required metrics and recent transactions.
- **AC-002**: Given normalized trader and transaction data exists, When trader analysis is requested, Then the platform returns a structured analysis result for the requested scope.
- **AC-003**: Given analysis results are available, When the user reviews trader details, Then the user can select one or more traders to follow using those results and supporting metrics.
- **AC-004**: Given traders are selected, When the user configures a strategy, Then the platform stores sizing rules, stop strategy, and whether TimesNet risk filtering is enabled.
- **AC-005**: Given a configured strategy is ready, When the user explicitly starts copy trading and required authorization passes, Then the platform creates an active copy-trade session.
- **AC-006**: Given a session is active, When a followed trader emits a new candidate transaction, Then the platform evaluates the candidate transaction before any copy execution occurs.
- **AC-007**: Given TimesNet risk filtering is enabled, When TimesNet marks a candidate transaction as high risk, Then the platform does not copy that transaction.
- **AC-008**: Given TimesNet risk filtering is enabled and all other gates pass, When a candidate transaction is not high risk, Then the platform copies the transaction automatically.
- **AC-009**: Given a stop strategy threshold is reached, When the threshold becomes active, Then the platform stops new copy execution and marks the session stopped with reason `stop_strategy`.
- **AC-010**: Given the user issues a manual stop, When the stop command is received, Then the platform stops new copy execution immediately and marks the session stopped with reason `manual`.
- **AC-011**: Given a withdrawal is initiated from a wallet vault, When destination validation and withdrawal policy checks pass, Then the platform can move the withdrawal request into an approved or submitted state.
- **AC-012**: Given a candidate transaction is processed more than once upstream, When decisioning occurs, Then the platform does not create duplicate copied execution for the same source transaction.
- **AC-013**: Given a follow strategy is created in one channel, When the user queries it from another supported channel, Then the platform returns the same canonical strategy state.
- **AC-014**: Given an LLM explanation is generated for a trader or decision, When the explanation conflicts with explicit strategy or TimesNet gating output, Then execution behavior follows the deterministic strategy and TimesNet result rather than the LLM output.

## 6. Test Automation Strategy

- **Test Levels**: Unit, Integration, End-to-End
- **Frameworks**: Use the repository’s existing JavaScript/TypeScript and model-service test stack.
- **Test Data Management**: Use deterministic fixtures for trader rankings, trader analysis outputs, strategy state, TimesNet risk outputs, wallet authorization state, Telegram callback payloads, and withdrawal requests. Clean persisted strategy, session, and decision records after integration tests.
- **CI/CD Integration**: Run ingestion normalization, strategy lifecycle, candidate decisioning, wallet authorization, Telegram flow, and withdrawal-policy tests in automated CI pipelines. Validate training-data export and feature-generation contracts against [spec-data-timesnet-training-schema.md](./spec-data-timesnet-training-schema.md) in the data-pipeline test suite.
- **Coverage Requirements**: Cover normalization logic, field/window grouping, candidate gating logic, manual stop behavior, stop-strategy activation, channel consistency, vault policy enforcement, and idempotent decision handling.
- **Performance Testing**: Measure ingestion throughput and candidate decision latency under bursty trader activity.
- **Automation Focus Areas**:
  - Validate trader inspection output for supported windows.
  - Validate trader analysis and explanation payload shape.
  - Validate strategy creation and start gating.
  - Validate high-risk candidate blocking.
  - Validate stop strategy and manual stop transitions.
  - Validate Telegram command and callback handling.
  - Validate wallet-extension authorization failure and approval paths.
  - Validate withdrawal destination and policy enforcement.
  - Validate duplicate source transaction suppression.

## 7. Rationale & Context

The platform must do more than mirror trader activity. Users need a reliable pipeline from trader discovery to strategy execution, with clear risk gating and clear operational control. The merged specification combines the data and ingestion backbone, the runtime copy-trading workflow, and the multi-channel execution surfaces into one canonical platform contract. TimesNet risk gating is a core safety rule because high-risk transactions must be blocked before execution. Polymarket export quality remains a critical dependency, but the detailed export, feature, and label contracts are intentionally separated into [spec-data-timesnet-training-schema.md](./spec-data-timesnet-training-schema.md) so data-pipeline work can evolve independently without changing runtime product contracts. LLM support is intentionally constrained to explanation and interpretation so deterministic risk and authorization controls remain authoritative. Cross-channel consistency is also core because users may inspect and manage strategies from different interfaces while relying on the same underlying state.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Trader activity source - Provides top trader rankings, trader metrics, and transaction history required for inspection and runtime monitoring.
- **EXT-002**: Execution venue interface - Accepts validated copy-trade execution requests and returns execution outcomes.
- **EXT-003**: Telegram Bot API - Supports Telegram-based interaction flows and callback delivery.
- **EXT-004**: Polymarket market-data source - Provides market metadata, order-book state, trader activity, and transaction history required for export and model training.

### Third-Party Services
- **SVC-001**: TimesNet scoring service - Produces candidate-transaction risk scores used for gating.
- **SVC-002**: Wallet provider interface - Supports wallet-extension connectivity and signature-based authorization.
- **SVC-003**: LLM inference service - Produces trader-analysis and decision explanations for operator-facing or user-facing workflows.

### Infrastructure Dependencies
- **INF-001**: Event or polling runtime - Detects new candidate transactions for active sessions.
- **INF-002**: Persistent data store - Stores trader data, analyses, strategies, sessions, authorization state, decision history, and export metadata.
- **INF-003**: Audit and observability system - Stores structured lifecycle and decision events.
- **INF-004**: Vault subsystem - Stores or mediates execution authority under policy constraints.
- **INF-005**: Export and feature-engineering runtime - Produces normalized training datasets, feature windows, and labels.

### Data Dependencies
- **DAT-001**: Recent top trader ranking data - Required for inspection and trader selection.
- **DAT-002**: Normalized transaction history - Required for analysis, strategy evaluation, runtime decisions, and training export.
- **DAT-003**: Runtime candidate transaction stream - Required for active session monitoring and copy decisions.
- **DAT-004**: Polymarket market-state history - Required for time-series feature construction and label generation.
- **DAT-005**: Versioned export metadata - Required for reproducible training and backtesting.

### Technology Platform Dependencies
- **PLT-001**: Runtime capable of asynchronous monitoring and decision execution - Required to support active copy-trade sessions.
- **PLT-002**: Structured model-output handling - Required so analysis outputs can be consumed consistently by product layers.
- **PLT-003**: Time-series training pipeline capability - Required to generate supervised datasets and train or evaluate TimesNet models.

### Compliance Dependencies
- **COM-001**: Auditability of automated trading actions - Required so starts, stops, withdrawals, and blocked executions can be reviewed after the fact.
- **COM-002**: Dataset lineage and provenance controls - Required so training exports can be traced to source intervals, feature logic, and labeling rules.

**Note**: This section focuses on required capabilities and integration boundaries rather than package-level implementation choices.

## 9. Examples & Edge Cases

```json
{
  "training_example": {
    "example_id": "train_20260413_000001",
    "schema_version": "1.0",
    "feature_version": "timesnet-v1",
    "label_version": "forward-return-v1",
    "source": "polymarket",
    "trader_id": "trader_42",
    "market_id": "market_btc_weekly",
    "anchor_transaction_id": "txn_9001",
    "feature_window_start": "2026-04-12T00:00:00Z",
    "feature_window_end": "2026-04-13T00:00:00Z",
    "prediction_horizon_end": "2026-04-13T12:00:00Z",
    "sequence_interval": "5m",
    "sequence_length": 288,
    "market_sequence": [
      {
        "ts": "2026-04-12T00:00:00Z",
        "best_bid": "0.47",
        "best_ask": "0.49",
        "mid_price": "0.48",
        "volume": "12450.00",
        "spread_bps": 417
      }
    ],
    "trader_sequence": [
      {
        "ts": "2026-04-12T00:00:00Z",
        "signed_notional": "2500.00",
        "trade_count": 1,
        "position_after": "5000.00"
      }
    ],
    "static_features": {
      "field": "crypto",
      "window": "24h"
    },
    "label_class": "unfavorable",
    "label_score": "-0.0831",
    "label_metadata": {
      "horizon": "12h",
      "threshold_bps": 300
    },
    "missing_data_ratio": "0.012"
  }
}
```

Edge cases that must be handled:

- A selected trader has strong historical performance but concentrated recent position risk.
- TimesNet scoring is temporarily unavailable during candidate transaction processing.
- The same candidate transaction arrives multiple times.
- A manual stop is issued while candidate decisions are in progress.
- A stop strategy triggers after prior copied positions exist; the platform must stop new copy execution even if separate position-management logic continues.
- A Telegram request exceeds message-size or callback-state limits.
- A wallet-extension signature request is rejected or times out.
- A withdrawal request targets an invalid destination or violates vault policy.
- A Polymarket export interval contains partial market-state gaps; the export must surface completeness metrics rather than silently filling unknown values.
- A training label cannot be resolved because the market remains open beyond the configured horizon; the example must be marked `neutral_or_unresolved` or excluded by explicit policy.
- LLM-generated trader commentary contradicts deterministic model outputs; the explanation must be retained as advisory text only.

## 10. Validation Criteria

- The specification is satisfied only if the platform can be described end to end from trader ingestion through copy-trade stop and withdrawal handling.
- The platform must expose explicit contracts for trader summaries, trader analysis, strategies, sessions, candidate decisioning, channel sessions, vaults, authorization, and withdrawals.
- A high-risk TimesNet result must prevent copying when the filter is enabled.
- Manual stop and stop-strategy trigger must both stop new copy execution.
- Cross-channel strategy state must remain canonical.
- Withdrawal approval must require destination validation and policy enforcement.
- Duplicate source transactions must not create duplicate copied execution.
- LLM output must remain advisory and must not supersede deterministic execution gates.
- Training-data validation must be delegated to [spec-data-timesnet-training-schema.md](./spec-data-timesnet-training-schema.md).

## 11. Related Specifications / Further Reading

- [spec-agent-natural-language-copy-trading-interaction.md](./spec-agent-natural-language-copy-trading-interaction.md)
- [spec-data-timesnet-training-schema.md](./spec-data-timesnet-training-schema.md)
