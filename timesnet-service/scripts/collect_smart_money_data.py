"""
Smart Money Analysis Dataset Collector for TimesNet

Collects and processes data from DexScreener API (free, no auth required)
for training TimesNet models on short-term forecasting and anomaly detection.

Usage:
    uv run python scripts/collect_smart_money_data.py

Output:
    - dataset/smart_money/*.csv - Individual token datasets
    - dataset/smart_money_anomaly/ - Anomaly detection datasets
"""

import os
import sys
import time
import json
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import warnings

warnings.filterwarnings("ignore")


@dataclass
class Config:
    """Dataset collection configuration"""

    # Solana token addresses (for DexScreener)
    TOKENS: Dict[str, str] = None  # symbol -> token_address

    # Time settings
    DAYS_HISTORY: int = 30
    GRANULARITY_MINUTES: int = 15

    # API settings
    DEXSCREENER_BASE_URL: str = "https://api.dexscreener.com/latest"
    RATE_LIMIT_DELAY: float = 1.0  # DexScreener is more lenient
    MAX_RETRIES: int = 3

    # Output paths
    OUTPUT_DIR: str = "dataset/smart_money"
    ANOMALY_DIR: str = "dataset/smart_money_anomaly"

    # Data split ratios
    TRAIN_RATIO: float = 0.7
    VAL_RATIO: float = 0.1
    TEST_RATIO: float = 0.2

    def __post_init__(self):
        if self.TOKENS is None:
            # Top Solana tokens with their addresses
            self.TOKENS = {
                "SOL": "So11111111111111111111111111111111111111112",  # Wrapped SOL
                "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
                "JUP": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
                "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
                "PYTH": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
            }


class DexScreenerCollector:
    """Collects data from DexScreener API"""

    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(
            {"Accept": "application/json", "User-Agent": "SmartMoneyAnalysis/1.0"}
        )

    def _make_request(self, url: str, params: dict = None) -> Optional[dict]:
        """Make API request with retry logic"""
        for attempt in range(self.config.MAX_RETRIES):
            try:
                response = self.session.get(url, params=params, timeout=30)

                if response.status_code == 429:
                    wait_time = (attempt + 1) * 5
                    print(f"  Rate limited, waiting {wait_time}s...")
                    time.sleep(wait_time)
                    continue

                response.raise_for_status()
                return response.json()

            except requests.exceptions.RequestException as e:
                print(f"  Request failed (attempt {attempt + 1}): {e}")
                if attempt < self.config.MAX_RETRIES - 1:
                    time.sleep(self.config.RATE_LIMIT_DELAY * 2)

        return None

    def fetch_token_data(self, token_address: str) -> Optional[dict]:
        """Fetch token data from DexScreener"""
        url = f"{self.config.DEXSCREENER_BASE_URL}/dex/tokens/{token_address}"
        data = self._make_request(url)
        time.sleep(self.config.RATE_LIMIT_DELAY)
        return data

    def fetch_pair_data(self, pair_address: str) -> Optional[dict]:
        """Fetch pair/pool data from DexScreener"""
        url = f"{self.config.DEXSCREENER_BASE_URL}/dex/pairs/solana/{pair_address}"
        data = self._make_request(url)
        time.sleep(self.config.RATE_LIMIT_DELAY)
        return data


class SyntheticDataGenerator:
    """
    Generates realistic synthetic data when API data is limited.
    Uses DexScreener current data as seed for realistic patterns.
    """

    def __init__(self, config: Config):
        self.config = config
        self.collector = DexScreenerCollector(config)

    def generate_historical_data(
        self,
        symbol: str,
        token_address: str,
        days: int = 30,
        granularity_minutes: int = 15,
    ) -> Optional[pd.DataFrame]:
        """
        Generate historical data based on current market data.

        Uses real current price/volume from DexScreener and generates
        realistic historical patterns using random walk with drift.
        """
        print(f"  Fetching current data from DexScreener...")

        # Get current data from DexScreener
        data = self.collector.fetch_token_data(token_address)

        if not data or "pairs" not in data or not data["pairs"]:
            print(f"  No DexScreener data for {symbol}, using defaults...")
            # Use realistic defaults for Solana tokens
            current_price = self._get_default_price(symbol)
            current_volume = self._get_default_volume(symbol)
            price_change_24h = 0
        else:
            # Get the most liquid pair (highest volume)
            pairs = sorted(
                data["pairs"],
                key=lambda x: float(x.get("volume", {}).get("h24", 0) or 0),
                reverse=True,
            )
            best_pair = pairs[0]

            current_price = float(
                best_pair.get("priceUsd", 0) or self._get_default_price(symbol)
            )
            current_volume = float(
                best_pair.get("volume", {}).get("h24", 0)
                or self._get_default_volume(symbol)
            )
            price_change_24h = float(
                best_pair.get("priceChange", {}).get("h24", 0) or 0
            )

            print(f"  Current price: ${current_price:.6f}")
            print(f"  24h volume: ${current_volume:,.0f}")
            print(f"  24h change: {price_change_24h:.2f}%")

        # Generate time index
        intervals_per_day = (24 * 60) // granularity_minutes
        total_intervals = days * intervals_per_day

        end_time = datetime.utcnow().replace(second=0, microsecond=0)
        # Align to granularity
        end_time = end_time - timedelta(minutes=end_time.minute % granularity_minutes)

        timestamps = pd.date_range(
            end=end_time, periods=total_intervals, freq=f"{granularity_minutes}min"
        )

        # Generate price series using Geometric Brownian Motion
        prices = self._generate_gbm_prices(
            current_price=current_price,
            num_periods=total_intervals,
            volatility=self._get_volatility(symbol),
            drift=price_change_24h
            / 100
            / intervals_per_day,  # Convert to per-period drift
        )

        # Generate volume series
        volumes = self._generate_volume_series(
            base_volume=current_volume / intervals_per_day,
            num_periods=total_intervals,
            symbol=symbol,
        )

        # Generate market cap (proportional to price)
        base_supply = self._get_circulating_supply(symbol)
        market_caps = prices * base_supply

        # Create DataFrame
        df = pd.DataFrame(
            {
                "timestamp": timestamps,
                "price": prices,
                "volume": volumes,
                "market_cap": market_caps,
            }
        )

        return df

    def _generate_gbm_prices(
        self,
        current_price: float,
        num_periods: int,
        volatility: float = 0.02,
        drift: float = 0.0001,
    ) -> np.ndarray:
        """
        Generate price series using Geometric Brownian Motion.
        Goes backwards from current price to generate historical data.
        """
        # Generate random returns
        np.random.seed(42)  # For reproducibility in MVP

        # Add some realistic patterns
        # 1. Base random walk
        returns = np.random.normal(drift, volatility, num_periods)

        # 2. Add momentum (autocorrelation)
        momentum = 0.1
        for i in range(1, len(returns)):
            returns[i] += momentum * returns[i - 1]

        # 3. Add some mean reversion
        mean_reversion = 0.02
        cumulative = np.cumsum(returns)
        for i in range(1, len(returns)):
            returns[i] -= mean_reversion * cumulative[i - 1] / (i + 1)

        # 4. Add occasional jumps (news events)
        jump_prob = 0.01
        jump_size = 0.05
        jumps = (
            np.random.binomial(1, jump_prob, num_periods)
            * np.random.choice([-1, 1], num_periods)
            * jump_size
        )
        returns += jumps

        # Calculate prices going backwards from current
        log_returns = np.cumsum(returns[::-1])[::-1]
        prices = current_price * np.exp(-log_returns)

        return prices

    def _generate_volume_series(
        self, base_volume: float, num_periods: int, symbol: str
    ) -> np.ndarray:
        """Generate realistic volume series with patterns"""
        np.random.seed(43)

        # Base volume with log-normal distribution
        volumes = np.random.lognormal(
            mean=np.log(base_volume), sigma=0.5, size=num_periods
        )

        # Add time-of-day pattern (higher volume during US trading hours)
        hour_pattern = np.array(
            [
                0.5,
                0.4,
                0.3,
                0.3,
                0.4,
                0.5,  # 0-5 UTC (low - Asia night)
                0.7,
                0.8,
                0.9,
                1.0,
                1.0,
                0.9,  # 6-11 UTC (Europe morning)
                1.2,
                1.3,
                1.4,
                1.5,
                1.4,
                1.3,  # 12-17 UTC (US morning/afternoon)
                1.2,
                1.1,
                1.0,
                0.9,
                0.7,
                0.6,  # 18-23 UTC (US evening)
            ]
        )

        intervals_per_hour = 60 // self.config.GRANULARITY_MINUTES
        hour_multipliers = np.tile(
            np.repeat(hour_pattern, intervals_per_hour),
            num_periods // (24 * intervals_per_hour) + 1,
        )[:num_periods]

        volumes *= hour_multipliers

        # Add some volume spikes (whale activity simulation)
        spike_prob = 0.02
        spike_multiplier = 5
        spikes = np.random.binomial(1, spike_prob, num_periods)
        volumes *= 1 + spikes * (spike_multiplier - 1)

        return volumes

    def _get_default_price(self, symbol: str) -> float:
        """Get default price for a token"""
        defaults = {
            "SOL": 150.0,
            "BONK": 0.000025,
            "JUP": 0.80,
            "WIF": 1.50,
            "PYTH": 0.35,
        }
        return defaults.get(symbol, 1.0)

    def _get_default_volume(self, symbol: str) -> float:
        """Get default 24h volume"""
        defaults = {
            "SOL": 2_000_000_000,
            "BONK": 500_000_000,
            "JUP": 200_000_000,
            "WIF": 300_000_000,
            "PYTH": 100_000_000,
        }
        return defaults.get(symbol, 10_000_000)

    def _get_volatility(self, symbol: str) -> float:
        """Get typical volatility (per 15-min period)"""
        # Higher for meme coins
        defaults = {
            "SOL": 0.008,
            "BONK": 0.025,
            "JUP": 0.015,
            "WIF": 0.030,
            "PYTH": 0.012,
        }
        return defaults.get(symbol, 0.015)

    def _get_circulating_supply(self, symbol: str) -> float:
        """Get approximate circulating supply"""
        defaults = {
            "SOL": 440_000_000,
            "BONK": 69_000_000_000_000,
            "JUP": 1_350_000_000,
            "WIF": 998_000_000,
            "PYTH": 3_600_000_000,
        }
        return defaults.get(symbol, 1_000_000_000)


class FeatureEngineer:
    """Generates technical and smart money features"""

    def __init__(self, config: Config):
        self.config = config

    def calculate_technical_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate technical analysis features"""
        df = df.copy()

        # Price changes
        df["price_change_1h"] = df["price"].pct_change(periods=4)
        df["price_change_4h"] = df["price"].pct_change(periods=16)
        df["price_change_24h"] = df["price"].pct_change(periods=96)

        # Volatility
        df["volatility_1h"] = (
            df["price"].rolling(window=4).std() / df["price"].rolling(window=4).mean()
        )
        df["volatility_4h"] = (
            df["price"].rolling(window=16).std() / df["price"].rolling(window=16).mean()
        )
        df["volatility_24h"] = (
            df["price"].rolling(window=96).std() / df["price"].rolling(window=96).mean()
        )

        # RSI
        df["rsi_14"] = self._calculate_rsi(df["price"], periods=14)
        df["rsi_28"] = self._calculate_rsi(df["price"], periods=28)

        # MACD
        df["macd"], df["macd_signal"], df["macd_hist"] = self._calculate_macd(
            df["price"]
        )

        # Bollinger Bands
        df["bb_upper"], df["bb_middle"], df["bb_lower"] = (
            self._calculate_bollinger_bands(df["price"])
        )
        df["bb_position"] = (df["price"] - df["bb_lower"]) / (
            df["bb_upper"] - df["bb_lower"] + 1e-10
        )

        # Volume features
        if "volume" in df.columns:
            df["volume_change_1h"] = df["volume"].pct_change(periods=4)
            df["volume_ma_ratio"] = df["volume"] / (
                df["volume"].rolling(window=24).mean() + 1e-10
            )
            df["volume_std"] = df["volume"].rolling(window=24).std()

        # Momentum
        df["momentum_1h"] = df["price"] - df["price"].shift(4)
        df["momentum_4h"] = df["price"] - df["price"].shift(16)

        # Moving averages
        df["sma_12"] = df["price"].rolling(window=12).mean()
        df["sma_24"] = df["price"].rolling(window=24).mean()
        df["ema_12"] = df["price"].ewm(span=12).mean()
        df["ema_24"] = df["price"].ewm(span=24).mean()

        # Price relative to MAs
        df["price_sma_ratio"] = df["price"] / (df["sma_24"] + 1e-10)
        df["sma_cross"] = (df["sma_12"] > df["sma_24"]).astype(int)

        return df

    def generate_smart_money_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Generate smart money features from price/volume patterns"""
        df = df.copy()

        # Volume z-score (whale activity indicator)
        if "volume" in df.columns and df["volume"].notna().any():
            volume_mean = df["volume"].rolling(window=96).mean()
            volume_std = df["volume"].rolling(window=96).std()
            df["volume_zscore"] = (df["volume"] - volume_mean) / (volume_std + 1e-10)
            df["whale_activity"] = (df["volume_zscore"] > 2).astype(float)
            df["large_tx_count"] = (
                np.clip(df["volume_zscore"] * 3, 0, 15).fillna(0).astype(int)
            )
        else:
            df["volume_zscore"] = 0
            df["whale_activity"] = 0
            df["large_tx_count"] = 0

        # Smart money flow estimation
        price_direction = np.sign(df["price"].diff())
        volume_factor = df["volume_zscore"].clip(lower=0)
        df["smart_money_flow"] = price_direction * volume_factor * df["price"] * 0.01
        df["smart_money_flow"] = df["smart_money_flow"].fillna(0)

        # Accumulation/Distribution
        if "volume" in df.columns:
            high = df["price"].rolling(4).max()
            low = df["price"].rolling(4).min()
            close = df["price"]
            clv = ((close - low) - (high - close)) / (high - low + 1e-10)
            df["accumulation_dist"] = (clv * df["volume"]).cumsum()
            df["accumulation_dist"] = df["accumulation_dist"].fillna(0)
        else:
            df["accumulation_dist"] = 0

        # Buy/Sell pressure ratio
        df["buy_pressure"] = np.where(
            df["price"].diff() > 0,
            df.get("volume", 1) * abs(df["price"].pct_change()),
            0,
        )
        df["sell_pressure"] = np.where(
            df["price"].diff() < 0,
            df.get("volume", 1) * abs(df["price"].pct_change()),
            0,
        )

        buy_sum = df["buy_pressure"].rolling(24).sum()
        sell_sum = df["sell_pressure"].rolling(24).sum()
        df["buy_sell_ratio"] = buy_sum / (sell_sum + 1e-10)
        df["buy_sell_ratio"] = df["buy_sell_ratio"].clip(0.1, 10)

        # Smart money confidence score
        df["sm_confidence"] = (
            0.3 * df["volume_zscore"].clip(-2, 2) / 2
            + 0.3 * df["rsi_14"].fillna(50).clip(30, 70) / 70
            + 0.2 * df["bb_position"].fillna(0.5).clip(0, 1)
            + 0.2 * (df["buy_sell_ratio"].clip(0.5, 2) - 0.5) / 1.5
        )
        df["sm_confidence"] = df["sm_confidence"].clip(0, 1)

        return df

    def _calculate_rsi(self, prices: pd.Series, periods: int = 14) -> pd.Series:
        delta = prices.diff()
        gain = delta.where(delta > 0, 0).rolling(window=periods).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=periods).mean()
        rs = gain / (loss + 1e-10)
        rsi = 100 - (100 / (1 + rs))
        return rsi

    def _calculate_macd(
        self, prices: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        ema_fast = prices.ewm(span=fast).mean()
        ema_slow = prices.ewm(span=slow).mean()
        macd = ema_fast - ema_slow
        macd_signal = macd.ewm(span=signal).mean()
        macd_hist = macd - macd_signal
        return macd, macd_signal, macd_hist

    def _calculate_bollinger_bands(
        self, prices: pd.Series, window: int = 20, num_std: float = 2
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        sma = prices.rolling(window=window).mean()
        std = prices.rolling(window=window).std()
        upper = sma + (std * num_std)
        lower = sma - (std * num_std)
        return upper, sma, lower


class AnomalyLabeler:
    """Generates anomaly labels for the dataset"""

    def __init__(self, config: Config):
        self.config = config

    def generate_labels(self, df: pd.DataFrame) -> pd.Series:
        """Generate binary anomaly labels"""
        labels = pd.Series(0, index=df.index)

        # Price anomalies
        if "price_change_1h" in df.columns:
            price_std = df["price_change_1h"].std()
            price_mean = df["price_change_1h"].mean()
            price_anomaly = abs(df["price_change_1h"] - price_mean) > 3 * price_std
            labels = labels | price_anomaly.fillna(False).astype(int)

        # Volume anomalies
        if "volume_zscore" in df.columns:
            volume_anomaly = df["volume_zscore"].abs() > 3
            labels = labels | volume_anomaly.fillna(False).astype(int)

        # Whale activity anomalies
        if "whale_activity" in df.columns:
            whale_sum = df["whale_activity"].rolling(4).sum()
            whale_anomaly = whale_sum >= 3
            labels = labels | whale_anomaly.fillna(False).astype(int)

        # RSI extremes
        if "rsi_14" in df.columns:
            rsi_anomaly = (df["rsi_14"] < 20) | (df["rsi_14"] > 80)
            labels = labels | rsi_anomaly.fillna(False).astype(int)

        return labels.fillna(0).astype(int)


class DatasetFormatter:
    """Formats data for TimesNet compatibility"""

    def __init__(self, config: Config):
        self.config = config

    def prepare_forecasting_dataset(
        self, df: pd.DataFrame, symbol: str
    ) -> pd.DataFrame:
        """Prepare dataset for TimesNet forecasting task"""
        feature_columns = [
            "price",
            "price_change_1h",
            "price_change_4h",
            "volume",
            "volume_ma_ratio",
            "volatility_1h",
            "volatility_4h",
            "rsi_14",
            "macd",
            "bb_position",
            "momentum_1h",
            "price_sma_ratio",
            "smart_money_flow",
            "buy_sell_ratio",
            "sm_confidence",
            "whale_activity",
            "large_tx_count",
        ]

        available_cols = [c for c in feature_columns if c in df.columns]

        output_df = pd.DataFrame()
        output_df["date"] = df["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")

        for col in available_cols:
            output_df[col] = df[col]

        # Target: next price
        output_df["OT"] = df["price"].shift(-1)

        output_df = output_df.dropna()

        return output_df

    def prepare_anomaly_dataset(
        self, df: pd.DataFrame, labels: pd.Series
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Prepare dataset for TimesNet anomaly detection"""
        feature_columns = [
            "price",
            "volume",
            "price_change_1h",
            "price_change_4h",
            "volatility_1h",
            "volatility_4h",
            "rsi_14",
            "macd",
            "bb_position",
            "momentum_1h",
            "price_sma_ratio",
            "smart_money_flow",
            "buy_sell_ratio",
            "sm_confidence",
        ]

        available_cols = [c for c in feature_columns if c in df.columns]

        # Handle NaN values
        feature_df = df[available_cols].copy()
        feature_df = feature_df.fillna(method="ffill").fillna(method="bfill").fillna(0)

        aligned_labels = labels.reindex(df.index).fillna(0).astype(int)

        n = len(feature_df)
        train_end = int(n * self.config.TRAIN_RATIO)
        val_end = int(n * (self.config.TRAIN_RATIO + self.config.VAL_RATIO))

        train_df = feature_df.iloc[:train_end].copy()
        test_df = feature_df.iloc[val_end:].copy()
        test_labels = aligned_labels.iloc[val_end:].copy()

        test_labels_df = pd.DataFrame({"label": test_labels.values})

        return train_df, test_df, test_labels_df


def main():
    """Main execution function"""
    print("=" * 60)
    print("Smart Money Analysis Dataset Collector")
    print("Using: DexScreener API + Synthetic Historical Data")
    print("=" * 60)

    config = Config()
    generator = SyntheticDataGenerator(config)
    engineer = FeatureEngineer(config)
    labeler = AnomalyLabeler(config)
    formatter = DatasetFormatter(config)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(script_dir)
    output_dir = os.path.join(base_dir, config.OUTPUT_DIR)
    anomaly_dir = os.path.join(base_dir, config.ANOMALY_DIR)

    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(anomaly_dir, exist_ok=True)

    print(f"\nOutput directory: {output_dir}")
    print(f"Anomaly directory: {anomaly_dir}")
    print(f"Tokens: {list(config.TOKENS.keys())}")
    print(f"History: {config.DAYS_HISTORY} days")
    print(f"Granularity: {config.GRANULARITY_MINUTES} minutes")
    print("-" * 60)

    all_datasets = []

    for symbol, token_address in config.TOKENS.items():
        print(f"\n[{symbol}] Processing...")

        # 1. Generate historical data (uses DexScreener for current price)
        df = generator.generate_historical_data(
            symbol=symbol,
            token_address=token_address,
            days=config.DAYS_HISTORY,
            granularity_minutes=config.GRANULARITY_MINUTES,
        )

        if df is None or df.empty:
            print(f"  WARNING: No data for {symbol}, skipping...")
            continue

        print(f"  Generated data: {len(df)} rows")

        # 2. Calculate technical features
        df = engineer.calculate_technical_features(df)
        print(f"  Technical features: {len(df.columns)} columns")

        # 3. Generate smart money features
        df = engineer.generate_smart_money_features(df)
        print(f"  Total features: {len(df.columns)} columns")

        # 4. Generate anomaly labels
        labels = labeler.generate_labels(df)
        anomaly_count = labels.sum()
        print(
            f"  Anomalies: {anomaly_count} ({anomaly_count / len(labels) * 100:.1f}%)"
        )

        # 5. Prepare forecasting dataset
        forecast_df = formatter.prepare_forecasting_dataset(df, symbol)

        forecast_df_with_symbol = forecast_df.copy()
        forecast_df_with_symbol.insert(1, "symbol", symbol)
        all_datasets.append(forecast_df_with_symbol)

        # 6. Save individual token dataset
        output_path = os.path.join(output_dir, f"{symbol}.csv")
        forecast_df.to_csv(output_path, index=False)
        print(f"  Saved: {output_path} ({len(forecast_df)} rows)")

        # 7. Prepare and save anomaly detection dataset
        train_df, test_df, test_labels_df = formatter.prepare_anomaly_dataset(
            df, labels
        )

        train_path = os.path.join(anomaly_dir, f"{symbol}_train.csv")
        test_path = os.path.join(anomaly_dir, f"{symbol}_test.csv")
        labels_path = os.path.join(anomaly_dir, f"{symbol}_test_label.csv")

        train_df.to_csv(train_path, index=False)
        test_df.to_csv(test_path, index=False)
        test_labels_df.to_csv(labels_path, index=False)

        print(f"  Anomaly data: train={len(train_df)}, test={len(test_df)}")

    # 8. Create combined dataset
    if all_datasets:
        combined_df = pd.concat(all_datasets, ignore_index=True)
        combined_path = os.path.join(output_dir, "combined.csv")
        combined_df.to_csv(combined_path, index=False)
        print(f"\nCombined dataset: {combined_path} ({len(combined_df)} rows)")

    # 9. Create combined anomaly detection dataset
    print("\nCreating combined anomaly detection dataset...")
    all_train = []
    all_test = []
    all_labels = []

    for symbol in config.TOKENS.keys():
        train_path = os.path.join(anomaly_dir, f"{symbol}_train.csv")
        test_path = os.path.join(anomaly_dir, f"{symbol}_test.csv")
        labels_path = os.path.join(anomaly_dir, f"{symbol}_test_label.csv")

        if os.path.exists(train_path):
            all_train.append(pd.read_csv(train_path))
            all_test.append(pd.read_csv(test_path))
            all_labels.append(pd.read_csv(labels_path))

    if all_train:
        combined_train = pd.concat(all_train, ignore_index=True)
        combined_test = pd.concat(all_test, ignore_index=True)
        combined_labels = pd.concat(all_labels, ignore_index=True)

        combined_train.to_csv(os.path.join(anomaly_dir, "train.csv"), index=False)
        combined_test.to_csv(os.path.join(anomaly_dir, "test.csv"), index=False)
        combined_labels.to_csv(os.path.join(anomaly_dir, "test_label.csv"), index=False)

        print(
            f"Combined anomaly: train={len(combined_train)}, test={len(combined_test)}"
        )

    # Summary
    print("\n" + "=" * 60)
    print("Dataset Collection Complete!")
    print("=" * 60)

    print(f"\nForecasting datasets ({output_dir}):")
    for f in sorted(os.listdir(output_dir)):
        fpath = os.path.join(output_dir, f)
        size = os.path.getsize(fpath) / 1024
        rows = len(pd.read_csv(fpath))
        print(f"  {f}: {rows} rows, {size:.1f} KB")

    print(f"\nAnomaly datasets ({anomaly_dir}):")
    for f in sorted(os.listdir(anomaly_dir)):
        if not f.startswith("."):
            fpath = os.path.join(anomaly_dir, f)
            size = os.path.getsize(fpath) / 1024
            print(f"  {f}: {size:.1f} KB")

    print("\n" + "-" * 60)
    print("TimesNet Usage Examples:")
    print("-" * 60)
    print("\n# Long-term forecasting:")
    print(f"python run.py --task_name long_term_forecast \\")
    print(f"  --model TimesNet --data custom \\")
    print(f"  --root_path ./dataset/smart_money \\")
    print(f"  --data_path SOL.csv --target OT \\")
    print(f"  --seq_len 96 --pred_len 24 --features M")
    print("\n# Anomaly detection:")
    print(f"python run.py --task_name anomaly_detection \\")
    print(f"  --model TimesNet --data custom \\")
    print(f"  --root_path ./dataset/smart_money_anomaly")


if __name__ == "__main__":
    main()
