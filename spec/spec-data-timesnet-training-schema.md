---
title: TimesNet Training Data Schema Specification
version: 1.0
date_created: 2026-04-13
last_updated: 2026-04-13
owner: universal
tags: [data, schema, timesnet, polymarket, training, copy-trading]
---

# Introduction

This specification defines the canonical data schema, export requirements, feature-generation rules, and label-generation rules for TimesNet training and evaluation within the smart-money-analysis project. It is optimized for training copy-trading risk and outcome models from Polymarket-derived market and trader activity data.

## 1. Purpose & Scope

This specification covers:

- Exporting normalized Polymarket market-state and trader-activity data.
- Defining canonical contracts for market snapshots, trader transactions, and TimesNet training examples.
- Defining causal feature-window and prediction-horizon rules.
- Defining label-generation requirements for transaction-level supervised learning.
- Defining dataset versioning, lineage, and reproducibility requirements.
- Defining data-quality metrics required before model training or backtesting.

Intended audience:

- Engineers implementing data ingestion, export, and feature engineering.
- Engineers implementing TimesNet training and evaluation pipelines.
- Future Generative AI agents that need a precise data contract for model-related work.

Out of scope:

- TimesNet architecture internals.
- Exchange- or SDK-specific implementation details.
- Live execution orchestration and user-channel behavior.
- LLM prompt design for end-user explanations.

Assumptions:

- Polymarket-derived source data can be normalized into stable internal schemas.
- Training and evaluation workflows require reproducible exported datasets.
- Sequential features must be causal for online decisioning use cases.
- Labels may depend on future market outcomes, but only within the declared prediction horizon.

## 2. Definitions

- **Polymarket Export**: A reproducible dataset extract containing market metadata, trader activity, and transaction events sourced from Polymarket and normalized for downstream use.
- **Training Dataset**: A versioned collection of normalized records, features, labels, and metadata used for model training, evaluation, or backtesting.
- **Feature Window**: The bounded lookback interval used to derive model input features from sequential market and trader activity.
- **Prediction Horizon**: The bounded future interval over which a label or target outcome is computed.
- **Anchor Transaction**: The transaction or decision point for which a supervised label is computed.
- **Causal Feature**: A feature derived only from information available on or before the anchor timestamp.
- **Label Leakage**: Use of information beyond the declared prediction horizon or otherwise unavailable at decision time.
- **Decimal String**: A numeric value serialized as a string to preserve exact precision for prices, notionals, and quantities.
- **Sequence Interval**: The fixed time step between adjacent elements in a time-series example.
- **Training Readiness Metric**: A quality metric such as missing-data rate, feature completeness, or label coverage used to judge whether an exported dataset is fit for model use.

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: The platform shall support reproducible export of normalized Polymarket datasets for offline TimesNet training, validation, and backtesting.
- **REQ-002**: Each export shall include enough market, trader, transaction, and temporal context to reconstruct ordered time-series examples without re-querying the upstream source.
- **REQ-003**: The platform shall derive versioned feature datasets from normalized event data using explicit feature-window and prediction-horizon definitions.
- **REQ-004**: The training dataset shall support transaction-level labels for at minimum `favorable`, `unfavorable`, and `neutral_or_unresolved` outcomes over a defined prediction horizon.
- **REQ-005**: The platform shall retain export metadata including source, extraction window, schema version, feature version, label version, and generation timestamp.
- **REQ-006**: The platform shall support deterministic regeneration of the same export when the same source interval, schema version, and feature logic are used.
- **REQ-007**: The platform shall expose training-readiness indicators, including missing-data rate, label coverage, and feature completeness for each export batch.
- **REQ-008**: Exported contracts shall preserve source provenance for each normalized record and each derived label.
- **REQ-009**: Exported price, size, quantity, liquidity, and notional fields shall use decimal-safe serialization.
- **REQ-010**: The export workflow shall support sequence intervals at minimum `1m`, `5m`, `15m`, `1h`, `4h`, and `1d`.
- **REQ-011**: The export workflow shall support both raw normalized layers and derived supervised-learning layers.

- **SEC-001**: Training exports shall exclude secrets, authentication artifacts, private keys, raw wallet-signature payloads, and non-essential personally identifiable information.
- **SEC-002**: Export provenance shall distinguish observed source facts from derived features, derived labels, and LLM-generated annotations if such annotations are ever attached.
- **SEC-003**: Data-quality checks shall fail closed for export batches that do not satisfy declared schema and lineage requirements.

- **CON-001**: Training labels must be generated from explicitly defined horizon rules and must not depend on future data beyond the declared prediction horizon.
- **CON-002**: Feature generation must be causal for online decisioning use cases; no feature may depend on information unavailable at the anchor timestamp.
- **CON-003**: Sequence ordering must be deterministic and stable across regeneration runs.
- **CON-004**: Missing values must be surfaced explicitly rather than silently imputed in the canonical export layer.
- **CON-005**: Market-state and trader-activity timestamps must be stored in ISO-8601 UTC form.

- **GUD-001**: Prefer separate layers for raw normalized observations, derived features, and derived labels.
- **GUD-002**: Prefer decimal strings or fixed-point formats for monetary and quantity values.
- **GUD-003**: Prefer explicit schema-version, feature-version, and label-version fields over implicit conventions.
- **GUD-004**: Prefer label definitions expressed in basis points, time horizon, and outcome-resolution rules.

- **PAT-001**: Use a dedicated Polymarket export contract for market-state observations.
- **PAT-002**: Use a dedicated trader-transaction contract for behavioral sequences.
- **PAT-003**: Use a dedicated training-example contract that joins sequential features, static features, and label metadata.

## 4. Interfaces & Data Contracts

### 4.1 Trader Transaction Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| transaction_id | string | Yes | Stable internal transaction identifier |
| source_transaction_id | string | Yes | Upstream source transaction identifier |
| trader_id | string | Yes | Internal trader identifier |
| market_id | string | Yes | Market identifier |
| field | enum | Yes | One of `crypto`, `sport`, `finance`, `other` |
| side | enum | Yes | `buy` or `sell` |
| outcome | string | No | Outcome side if applicable |
| price | decimal_string | Yes | Observed or executed price |
| size | decimal_string | Yes | Observed or executed size |
| notional | decimal_string | No | Derived notional value |
| position_after | decimal_string | No | Position after execution if available |
| best_bid | decimal_string | No | Best bid at or nearest before execution |
| best_ask | decimal_string | No | Best ask at or nearest before execution |
| spread_bps | integer | No | Bid-ask spread in basis points |
| executed_at | string (ISO-8601) | Yes | Source execution timestamp |
| ingestion_at | string (ISO-8601) | Yes | Local ingestion timestamp |
| raw_source | object | Yes | Original payload |

### 4.2 Polymarket Market Snapshot Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| snapshot_id | string | Yes | Unique market snapshot identifier |
| market_id | string | Yes | Canonical market identifier |
| source_market_id | string | Yes | Upstream Polymarket market identifier |
| captured_at | string (ISO-8601) | Yes | Snapshot timestamp |
| event_slug | string | No | Polymarket event slug |
| market_slug | string | No | Polymarket market slug |
| question | string | Yes | Human-readable market question |
| field | enum | Yes | One of `crypto`, `sport`, `finance`, `other` |
| status | enum | Yes | `open`, `closed`, `resolved`, `suspended`, `other` |
| outcome_tokens | array<object> | Yes | Outcome metadata including token ids and labels |
| best_bid | decimal_string | No | Best bid at snapshot time |
| best_ask | decimal_string | No | Best ask at snapshot time |
| mid_price | decimal_string | No | Mid-price at snapshot time |
| last_trade_price | decimal_string | No | Last observed trade price |
| volume_24h | decimal_string | No | 24-hour market volume |
| liquidity | decimal_string | No | Available liquidity metric |
| expiry_at | string (ISO-8601) | No | Market end or resolution deadline |
| raw_source | object | Yes | Original payload for traceability |

### 4.3 TimesNet Training Example Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| example_id | string | Yes | Unique training-example identifier |
| schema_version | string | Yes | Export schema version |
| feature_version | string | Yes | Feature logic version |
| label_version | string | Yes | Label logic version |
| source | string | Yes | Source system name such as `polymarket` |
| trader_id | string | Yes | Canonical trader identifier |
| market_id | string | Yes | Canonical market identifier |
| anchor_transaction_id | string | No | Candidate transaction used as anchor when transaction-level modeling is used |
| feature_window_start | string (ISO-8601) | Yes | Inclusive feature window start |
| feature_window_end | string (ISO-8601) | Yes | Inclusive feature window end |
| prediction_horizon_end | string (ISO-8601) | Yes | Label horizon end timestamp |
| sequence_interval | enum | Yes | One of `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| sequence_length | integer | Yes | Number of ordered timesteps in the feature tensor |
| market_sequence | array<object> | Yes | Ordered market-state observations for the feature window |
| trader_sequence | array<object> | Yes | Ordered trader-behavior observations for the feature window |
| static_features | object | No | Non-sequential features known at anchor time |
| label_class | enum | Yes | `favorable`, `unfavorable`, `neutral_or_unresolved` |
| label_score | decimal_string | No | Numeric target such as forward return or realized edge |
| label_metadata | object | Yes | Outcome-definition metadata including thresholds |
| missing_data_ratio | decimal_string | No | Fraction of expected values missing in the example |
| generated_at | string (ISO-8601) | Yes | Example generation timestamp |

### 4.4 Export Batch Metadata Contract

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| export_batch_id | string | Yes | Unique export batch identifier |
| source | string | Yes | Source system name |
| extraction_start | string (ISO-8601) | Yes | Inclusive extraction start |
| extraction_end | string (ISO-8601) | Yes | Inclusive extraction end |
| schema_version | string | Yes | Schema version used for this batch |
| feature_version | string | Yes | Feature logic version used for this batch |
| label_version | string | Yes | Label logic version used for this batch |
| generated_at | string (ISO-8601) | Yes | Batch generation timestamp |
| market_snapshot_count | integer | Yes | Number of exported market snapshots |
| transaction_count | integer | Yes | Number of exported transactions |
| training_example_count | integer | Yes | Number of generated training examples |
| missing_data_rate | decimal_string | No | Aggregate missing-data rate |
| feature_completeness_rate | decimal_string | No | Aggregate feature completeness rate |
| label_coverage_rate | decimal_string | No | Aggregate label coverage rate |

## 5. Acceptance Criteria

- **AC-001**: Given Polymarket source data is exported for a fixed interval, When the export job completes, Then the dataset contains normalized market snapshots, trader transactions, and export metadata needed for reproducible TimesNet training.
- **AC-002**: Given a TimesNet training example is generated, When its features are inspected, Then all sequential features are derived only from information available on or before the anchor timestamp.
- **AC-003**: Given a training export batch is generated, When data-quality checks run, Then the batch exposes missing-data rate, feature completeness, and label coverage metrics.
- **AC-004**: Given the same source interval, schema version, feature logic, and label logic, When an export is regenerated, Then the resulting batch is deterministically reproducible apart from generation timestamp metadata.
- **AC-005**: Given a training label cannot be resolved by the declared prediction horizon, When label generation completes, Then the example is marked `neutral_or_unresolved` or excluded according to explicit batch policy.

## 6. Test Automation Strategy

- **Test Levels**: Unit, Integration, End-to-End
- **Frameworks**: Use the repository’s existing JavaScript/TypeScript and model-service test stack.
- **Test Data Management**: Use deterministic fixtures for market snapshots, trader transactions, feature windows, label-generation logic, and export metadata. Clean export-batch records after integration tests.
- **CI/CD Integration**: Run normalization, export generation, feature engineering, label generation, and batch-quality tests in automated CI pipelines.
- **Coverage Requirements**: Cover Polymarket export reproducibility, causal feature generation, label horizon correctness, decimal serialization, lineage metadata, and missing-data reporting.
- **Performance Testing**: Measure export throughput and feature-generation throughput under large time windows and bursty transaction periods.

## 7. Rationale & Context

TimesNet model quality depends heavily on temporal schema quality. A weak export contract can introduce label leakage, missing market context, inconsistent sequencing, or precision drift. This specification isolates the data contract so model-training work can move independently from product-surface and runtime copy-trading behavior while remaining compatible with the main platform architecture.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Polymarket market-data source - Provides market metadata, order-book state, trader activity, and transaction history required for export and model training.

### Third-Party Services
- **SVC-001**: TimesNet training and evaluation runtime - Consumes exported sequential datasets.

### Infrastructure Dependencies
- **INF-001**: Persistent data store - Stores normalized source data and export metadata.
- **INF-002**: Export and feature-engineering runtime - Produces normalized training datasets, feature windows, and labels.

### Data Dependencies
- **DAT-001**: Polymarket market-state history - Required for time-series feature construction and label generation.
- **DAT-002**: Normalized trader transaction history - Required for trader-behavior sequences.
- **DAT-003**: Versioned export metadata - Required for reproducible training and backtesting.

### Technology Platform Dependencies
- **PLT-001**: Time-series training pipeline capability - Required to generate supervised datasets and train or evaluate TimesNet models.

### Compliance Dependencies
- **COM-001**: Dataset lineage and provenance controls - Required so training exports can be traced to source intervals, feature logic, and labeling rules.

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

- An export interval contains partial market-state gaps; the batch must surface completeness metrics rather than silently filling unknown values.
- A training label cannot be resolved because the market remains open beyond the configured horizon.
- The same source interval is exported twice and must produce the same ordered records and derived labels.
- Sparse trader activity results in short or partially empty behavioral sequences.
- Decimal rounding differences would alter labels if values were stored as floats.

## 10. Validation Criteria

- The specification is satisfied only if exported datasets can be used for deterministic TimesNet training and evaluation without re-querying upstream systems.
- Exported contracts must include market snapshots, trader transactions, training examples, and export batch metadata.
- Feature generation and labeling must avoid future-data leakage.
- Dataset batches must expose schema version, feature version, label version, and readiness metrics.
- Decimal-sensitive fields must preserve exact serialized values.

## 11. Related Specifications / Further Reading

- [spec-smart-money-copy-trading-platform.md](./spec-smart-money-copy-trading-platform.md)
