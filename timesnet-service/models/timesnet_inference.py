"""
TimesNet Inference Module
Loads trained TimesNet models and provides inference APIs
"""

import os
import sys
import torch
import numpy as np
import pandas as pd
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from sklearn.preprocessing import StandardScaler
import json

# Get checkpoint path from environment or use default relative to this file
CHECKPOINT_BASE_PATH = os.environ.get(
    "CHECKPOINT_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "checkpoints"),
)
print(f"Checkpoint path: {CHECKPOINT_BASE_PATH}")


def load_timesnet_model_class():
    """Load TimesNet Model class from local timesnet_lib"""
    from timesnet_lib.TimesNet import Model

    return Model


@dataclass
class ForecastResult:
    """Result from forecasting model"""

    predicted_prices: List[float]
    predicted_change_pct: float
    direction: str  # "up", "down", "neutral"
    confidence: float
    forecast_horizon: int  # Number of periods predicted


@dataclass
class AnomalyResult:
    """Result from anomaly detection model"""

    anomaly_scores: List[float]
    is_anomaly: List[bool]
    anomaly_ratio: float
    max_anomaly_score: float
    anomaly_indices: List[int]
    interpretation: str


class TimesNetForecaster:
    """
    TimesNet model for short-term price forecasting
    """

    def __init__(self, checkpoint_path: str = None, device: str = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.scaler = StandardScaler()
        self.model_loaded = False
        self.seq_len = 48
        self.pred_len = 12
        self.feature_dim = 18

        # Default checkpoint path
        if checkpoint_path is None:
            checkpoint_path = os.path.join(
                CHECKPOINT_BASE_PATH,
                "long_term_forecast_smart_money_forecast_TimesNet_custom_ftMS_sl48_pl12",
                "checkpoint.pth",
            )

        self.checkpoint_path = checkpoint_path

    def load_model(self):
        """Load the trained forecasting model"""
        if self.model_loaded:
            return

        try:
            Model = load_timesnet_model_class()
            import argparse

            # Create args namespace matching training config
            args = argparse.Namespace(
                task_name="long_term_forecast",
                seq_len=self.seq_len,
                label_len=24,
                pred_len=self.pred_len,
                top_k=3,
                num_kernels=6,
                enc_in=self.feature_dim,
                dec_in=self.feature_dim,
                c_out=1,
                d_model=32,
                n_heads=4,
                e_layers=2,
                d_layers=1,
                d_ff=32,
                dropout=0.1,
                embed="timeF",
                freq="t",
                activation="gelu",
            )

            self.model = Model(args).float().to(self.device)

            if os.path.exists(self.checkpoint_path):
                state_dict = torch.load(
                    self.checkpoint_path, map_location=self.device, weights_only=True
                )
                self.model.load_state_dict(state_dict)
                self.model.eval()
                self.model_loaded = True
                print(f"Forecasting model loaded from {self.checkpoint_path}")
            else:
                print(f"Warning: Checkpoint not found at {self.checkpoint_path}")
                self.model_loaded = False

        except Exception as e:
            print(f"Error loading forecasting model: {e}")
            self.model_loaded = False

    def preprocess(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Preprocess input data for the model

        Args:
            data: DataFrame with columns matching training features

        Returns:
            Tuple of (features, time_features)
        """
        # Expected columns (excluding date)
        feature_cols = [
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
            "OT",
        ]

        # Ensure we have required columns
        available_cols = [c for c in feature_cols if c in data.columns]

        if len(available_cols) < 10:
            raise ValueError(
                f"Insufficient features. Need at least 10, got {len(available_cols)}"
            )

        # Fill missing columns with zeros
        for col in feature_cols:
            if col not in data.columns:
                data[col] = 0.0

        # Extract features
        features = data[feature_cols].values.astype(np.float32)

        # Scale features
        features = self.scaler.fit_transform(features)

        # Create time features (simplified - just position encoding)
        time_features = np.zeros((len(data), 4), dtype=np.float32)

        return features, time_features

    def predict(
        self, data: pd.DataFrame, current_price: float = None
    ) -> ForecastResult:
        """
        Generate price forecast

        Args:
            data: DataFrame with at least seq_len rows of historical data
            current_price: Current price for calculating percentage change

        Returns:
            ForecastResult with predictions
        """
        if not self.model_loaded:
            self.load_model()

        if not self.model_loaded:
            # Return placeholder if model not available
            return self._placeholder_forecast(data, current_price)

        try:
            # Preprocess data
            features, time_features = self.preprocess(data)

            # Take last seq_len points
            if len(features) < self.seq_len:
                # Pad with first value
                pad_len = self.seq_len - len(features)
                features = np.vstack([np.tile(features[0], (pad_len, 1)), features])
                time_features = np.vstack(
                    [np.tile(time_features[0], (pad_len, 1)), time_features]
                )

            features = features[-self.seq_len :]
            time_features = time_features[-self.seq_len :]

            # Convert to tensors
            x = torch.FloatTensor(features).unsqueeze(0).to(self.device)
            x_mark = torch.FloatTensor(time_features).unsqueeze(0).to(self.device)

            # Create decoder input (zeros for prediction)
            dec_inp = (
                torch.zeros((1, self.pred_len + 24, self.feature_dim))
                .float()
                .to(self.device)
            )
            dec_mark = torch.zeros((1, self.pred_len + 24, 4)).float().to(self.device)

            # Run inference
            with torch.no_grad():
                output = self.model(x, x_mark, dec_inp, dec_mark)

            # Extract predictions (last column is OT/price)
            predictions = output[0, :, -1].cpu().numpy()

            # Inverse transform predictions
            dummy = np.zeros((len(predictions), self.feature_dim))
            dummy[:, -1] = predictions
            predictions = self.scaler.inverse_transform(dummy)[:, -1]

            # Calculate metrics
            if current_price is None:
                current_price = (
                    data["price"].iloc[-1]
                    if "price" in data.columns
                    else predictions[0]
                )

            final_price = predictions[-1]
            price_change_pct = ((final_price - current_price) / current_price) * 100

            # Determine direction and confidence
            if abs(price_change_pct) < 1:
                direction = "neutral"
                confidence = 0.5
            elif price_change_pct > 0:
                direction = "up"
                confidence = min(0.95, 0.5 + abs(price_change_pct) / 20)
            else:
                direction = "down"
                confidence = min(0.95, 0.5 + abs(price_change_pct) / 20)

            return ForecastResult(
                predicted_prices=predictions.tolist(),
                predicted_change_pct=float(price_change_pct),
                direction=direction,
                confidence=float(confidence),
                forecast_horizon=self.pred_len,
            )

        except Exception as e:
            print(f"Forecasting error: {e}")
            return self._placeholder_forecast(data, current_price)

    def _placeholder_forecast(
        self, data: pd.DataFrame, current_price: float = None
    ) -> ForecastResult:
        """Generate placeholder forecast when model not available"""
        if current_price is None:
            current_price = data["price"].iloc[-1] if "price" in data.columns else 100.0

        # Simple momentum-based placeholder
        if "price" in data.columns and len(data) >= 2:
            momentum = (
                (data["price"].iloc[-1] - data["price"].iloc[-12])
                / data["price"].iloc[-12]
                if len(data) >= 12
                else 0
            )
            predicted_change = momentum * 0.5 * 100  # Dampen momentum
        else:
            predicted_change = 0.0

        direction = (
            "up"
            if predicted_change > 1
            else ("down" if predicted_change < -1 else "neutral")
        )

        return ForecastResult(
            predicted_prices=[current_price * (1 + predicted_change / 100)]
            * self.pred_len,
            predicted_change_pct=predicted_change,
            direction=direction,
            confidence=0.3,
            forecast_horizon=self.pred_len,
        )


class TimesNetAnomalyDetector:
    """
    TimesNet model for anomaly detection
    """

    def __init__(self, checkpoint_path: str = None, device: str = None):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.scaler = StandardScaler()
        self.model_loaded = False
        self.seq_len = 100
        self.feature_dim = 14
        self.anomaly_ratio = 0.15

        # Default checkpoint path
        if checkpoint_path is None:
            checkpoint_path = os.path.join(
                CHECKPOINT_BASE_PATH,
                "anomaly_detection_smart_money_anomaly_TimesNet_SmartMoneyAnomaly_sl100",
                "checkpoint.pth",
            )

        self.checkpoint_path = checkpoint_path
        self.threshold = None

    def load_model(self):
        """Load the trained anomaly detection model"""
        if self.model_loaded:
            return

        try:
            Model = load_timesnet_model_class()
            import argparse

            # Create args namespace matching training config
            args = argparse.Namespace(
                task_name="anomaly_detection",
                seq_len=self.seq_len,
                label_len=48,
                pred_len=0,
                top_k=3,
                num_kernels=6,
                enc_in=self.feature_dim,
                dec_in=self.feature_dim,
                c_out=self.feature_dim,
                d_model=32,
                n_heads=4,
                e_layers=2,
                d_layers=1,
                d_ff=32,
                dropout=0.1,
                embed="timeF",
                freq="t",
                activation="gelu",
            )

            self.model = Model(args).float().to(self.device)

            if os.path.exists(self.checkpoint_path):
                state_dict = torch.load(
                    self.checkpoint_path, map_location=self.device, weights_only=True
                )
                self.model.load_state_dict(state_dict)
                self.model.eval()
                self.model_loaded = True
                # Default threshold based on training
                self.threshold = 0.02  # Adjust based on actual training results
                print(f"Anomaly detection model loaded from {self.checkpoint_path}")
            else:
                print(f"Warning: Checkpoint not found at {self.checkpoint_path}")
                self.model_loaded = False

        except Exception as e:
            print(f"Error loading anomaly model: {e}")
            self.model_loaded = False

    def preprocess(self, data: pd.DataFrame) -> np.ndarray:
        """
        Preprocess input data for anomaly detection

        Args:
            data: DataFrame with anomaly detection features

        Returns:
            Preprocessed feature array
        """
        # Expected columns for anomaly detection
        feature_cols = [
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

        # Use available columns
        available_cols = [c for c in feature_cols if c in data.columns]

        if len(available_cols) < 5:
            raise ValueError(f"Insufficient features for anomaly detection")

        # Fill missing columns
        for col in feature_cols:
            if col not in data.columns:
                data[col] = 0.0

        features = data[feature_cols].values.astype(np.float32)
        features = np.nan_to_num(features)

        # Scale features
        features = self.scaler.fit_transform(features)

        return features

    def detect(self, data: pd.DataFrame) -> AnomalyResult:
        """
        Detect anomalies in the data

        Args:
            data: DataFrame with historical data

        Returns:
            AnomalyResult with anomaly scores and flags
        """
        if not self.model_loaded:
            self.load_model()

        if not self.model_loaded:
            return self._placeholder_detection(data)

        try:
            # Preprocess data
            features = self.preprocess(data)

            # Need at least seq_len points
            if len(features) < self.seq_len:
                pad_len = self.seq_len - len(features)
                features = np.vstack([np.tile(features[0], (pad_len, 1)), features])

            # Calculate anomaly scores using reconstruction error
            all_scores = []

            for i in range(0, len(features) - self.seq_len + 1, self.seq_len // 2):
                window = features[i : i + self.seq_len]
                x = torch.FloatTensor(window).unsqueeze(0).to(self.device)

                with torch.no_grad():
                    output = self.model(x, None, None, None)

                # Calculate reconstruction error
                error = torch.mean((x - output) ** 2, dim=-1)
                scores = error[0].cpu().numpy()
                all_scores.extend(scores.tolist())

            # Pad to match original length
            while len(all_scores) < len(data):
                all_scores.append(all_scores[-1] if all_scores else 0.0)
            all_scores = all_scores[: len(data)]

            # Determine threshold and anomalies
            if self.threshold is None:
                self.threshold = np.percentile(
                    all_scores, 100 - self.anomaly_ratio * 100
                )

            is_anomaly = [s > self.threshold for s in all_scores]
            anomaly_indices = [i for i, a in enumerate(is_anomaly) if a]
            anomaly_ratio = sum(is_anomaly) / len(is_anomaly)

            # Generate interpretation
            interpretation = self._generate_interpretation(
                all_scores, is_anomaly, anomaly_ratio, data
            )

            return AnomalyResult(
                anomaly_scores=all_scores,
                is_anomaly=is_anomaly,
                anomaly_ratio=float(anomaly_ratio),
                max_anomaly_score=float(max(all_scores)),
                anomaly_indices=anomaly_indices,
                interpretation=interpretation,
            )

        except Exception as e:
            print(f"Anomaly detection error: {e}")
            return self._placeholder_detection(data)

    def _placeholder_detection(self, data: pd.DataFrame) -> AnomalyResult:
        """Generate placeholder detection when model not available"""
        n = len(data)
        scores = [0.01] * n

        # Simple heuristic: flag high volatility or volume spikes
        if "volatility_1h" in data.columns:
            vol_mean = data["volatility_1h"].mean()
            vol_std = data["volatility_1h"].std()
            for i, v in enumerate(data["volatility_1h"]):
                if v > vol_mean + 2 * vol_std:
                    scores[i] = 0.05

        threshold = 0.02
        is_anomaly = [s > threshold for s in scores]

        return AnomalyResult(
            anomaly_scores=scores,
            is_anomaly=is_anomaly,
            anomaly_ratio=sum(is_anomaly) / len(is_anomaly),
            max_anomaly_score=max(scores),
            anomaly_indices=[i for i, a in enumerate(is_anomaly) if a],
            interpretation="Placeholder detection - model not loaded",
        )

    def _generate_interpretation(
        self,
        scores: List[float],
        is_anomaly: List[bool],
        anomaly_ratio: float,
        data: pd.DataFrame,
    ) -> str:
        """Generate human-readable interpretation of anomaly detection"""

        n_anomalies = sum(is_anomaly)

        if n_anomalies == 0:
            return "No significant anomalies detected. Market behavior appears normal."

        # Analyze anomaly characteristics
        interpretations = []

        if anomaly_ratio > 0.2:
            interpretations.append(
                f"High anomaly rate ({anomaly_ratio * 100:.1f}%) - significant market irregularities detected"
            )
        elif anomaly_ratio > 0.1:
            interpretations.append(
                f"Moderate anomaly rate ({anomaly_ratio * 100:.1f}%) - some unusual activity present"
            )
        else:
            interpretations.append(
                f"Low anomaly rate ({anomaly_ratio * 100:.1f}%) - minor irregularities detected"
            )

        # Check for clustered anomalies
        anomaly_indices = [i for i, a in enumerate(is_anomaly) if a]
        if len(anomaly_indices) >= 3:
            # Check if anomalies are clustered
            gaps = [
                anomaly_indices[i + 1] - anomaly_indices[i]
                for i in range(len(anomaly_indices) - 1)
            ]
            if gaps and max(gaps) <= 3:
                interpretations.append(
                    "Anomalies are clustered - possible sustained unusual activity or whale movement"
                )

        # Check recent anomalies
        recent_anomalies = (
            sum(is_anomaly[-12:]) if len(is_anomaly) >= 12 else sum(is_anomaly)
        )
        if recent_anomalies > 3:
            interpretations.append(
                "Recent spike in anomalies - current market conditions warrant attention"
            )

        return " | ".join(interpretations)


class TimesNetService:
    """
    Combined service for TimesNet predictions
    Provides both forecasting and anomaly detection
    """

    def __init__(self):
        self.forecaster = TimesNetForecaster()
        self.anomaly_detector = TimesNetAnomalyDetector()
        self.version = "1.0.0"

    def initialize(self):
        """Load all models"""
        self.forecaster.load_model()
        self.anomaly_detector.load_model()

    @property
    def is_ready(self) -> bool:
        """Check if models are loaded"""
        return self.forecaster.model_loaded or self.anomaly_detector.model_loaded

    def get_full_analysis(
        self,
        data: pd.DataFrame,
        token_symbol: str = "UNKNOWN",
        current_price: float = None,
    ) -> Dict:
        """
        Get complete TimesNet analysis including forecast and anomaly detection

        Args:
            data: Historical data DataFrame
            token_symbol: Token symbol for context
            current_price: Current price (optional)

        Returns:
            Dictionary with forecast and anomaly results
        """
        forecast = self.forecaster.predict(data, current_price)
        anomalies = self.anomaly_detector.detect(data)

        # Combine into comprehensive analysis
        return {
            "token": token_symbol,
            "timestamp": pd.Timestamp.now().isoformat(),
            "model_version": self.version,
            "forecast": {
                "predicted_change_pct": forecast.predicted_change_pct,
                "direction": forecast.direction,
                "confidence": forecast.confidence,
                "horizon_periods": forecast.forecast_horizon,
                "horizon_hours": forecast.forecast_horizon * 0.25,  # 15-min intervals
                "predicted_prices": forecast.predicted_prices[
                    :5
                ],  # First 5 predictions
            },
            "anomaly_detection": {
                "anomaly_ratio": anomalies.anomaly_ratio,
                "max_anomaly_score": anomalies.max_anomaly_score,
                "recent_anomalies": sum(anomalies.is_anomaly[-12:])
                if len(anomalies.is_anomaly) >= 12
                else sum(anomalies.is_anomaly),
                "interpretation": anomalies.interpretation,
            },
            "combined_signal": self._generate_combined_signal(forecast, anomalies),
        }

    def _generate_combined_signal(
        self, forecast: ForecastResult, anomalies: AnomalyResult
    ) -> Dict:
        """Generate combined trading signal from forecast and anomaly detection"""

        # Base signal from forecast
        if forecast.direction == "up" and forecast.confidence > 0.6:
            base_signal = "bullish"
            base_strength = forecast.confidence
        elif forecast.direction == "down" and forecast.confidence > 0.6:
            base_signal = "bearish"
            base_strength = forecast.confidence
        else:
            base_signal = "neutral"
            base_strength = 0.5

        # Adjust for anomalies
        warnings = []

        if anomalies.anomaly_ratio > 0.2:
            base_strength *= 0.7  # Reduce confidence with high anomalies
            warnings.append("High anomaly rate detected - proceed with caution")

        recent_anomalies = (
            sum(anomalies.is_anomaly[-6:]) if len(anomalies.is_anomaly) >= 6 else 0
        )
        if recent_anomalies >= 3:
            warnings.append(
                "Recent anomaly cluster - possible whale activity or market manipulation"
            )

        # Determine action
        if (
            base_signal == "bullish"
            and base_strength > 0.65
            and anomalies.anomaly_ratio < 0.15
        ):
            action = "consider_buy"
            reasoning = f"Bullish forecast ({forecast.predicted_change_pct:+.2f}%) with normal market conditions"
        elif (
            base_signal == "bearish"
            and base_strength > 0.65
            and anomalies.anomaly_ratio < 0.15
        ):
            action = "consider_sell"
            reasoning = f"Bearish forecast ({forecast.predicted_change_pct:+.2f}%) with normal market conditions"
        elif anomalies.anomaly_ratio > 0.2:
            action = "monitor"
            reasoning = "Unusual market activity detected - monitoring recommended"
        else:
            action = "hold"
            reasoning = "No clear directional signal - maintain current position"

        return {
            "signal": base_signal,
            "strength": round(base_strength, 3),
            "action": action,
            "reasoning": reasoning,
            "warnings": warnings,
        }


# Singleton instance
_service_instance = None


def get_timesnet_service() -> TimesNetService:
    """Get or create the TimesNet service singleton"""
    global _service_instance
    if _service_instance is None:
        _service_instance = TimesNetService()
        _service_instance.initialize()
    return _service_instance
