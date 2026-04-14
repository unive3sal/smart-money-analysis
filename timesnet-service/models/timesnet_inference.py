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
        """
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

        available_cols = [c for c in feature_cols if c in data.columns]

        if len(available_cols) < 10:
            raise ValueError(
                f"Insufficient features. Need at least 10, got {len(available_cols)}"
            )

        for col in feature_cols:
            if col not in data.columns:
                data[col] = 0.0

        features = data[feature_cols].values.astype(np.float32)
        features = self.scaler.fit_transform(features)
        time_features = np.zeros((len(data), 4), dtype=np.float32)

        return features, time_features

    def predict(
        self, data: pd.DataFrame, current_price: float = None
    ) -> ForecastResult:
        """
        Generate price forecast
        """
        if not self.model_loaded:
            self.load_model()

        if not self.model_loaded:
            return self._placeholder_forecast(data, current_price)

        try:
            features, time_features = self.preprocess(data)

            if len(features) < self.seq_len:
                pad_len = self.seq_len - len(features)
                features = np.vstack([np.tile(features[0], (pad_len, 1)), features])
                time_features = np.vstack(
                    [np.tile(time_features[0], (pad_len, 1)), time_features]
                )

            features = features[-self.seq_len :]
            time_features = time_features[-self.seq_len :]

            x = torch.FloatTensor(features).unsqueeze(0).to(self.device)
            x_mark = torch.FloatTensor(time_features).unsqueeze(0).to(self.device)

            dec_inp = (
                torch.zeros((1, self.pred_len + 24, self.feature_dim))
                .float()
                .to(self.device)
            )
            dec_mark = torch.zeros((1, self.pred_len + 24, 4)).float().to(self.device)

            with torch.no_grad():
                output = self.model(x, x_mark, dec_inp, dec_mark)

            predictions = output[0, :, -1].cpu().numpy()

            dummy = np.zeros((len(predictions), self.feature_dim))
            dummy[:, -1] = predictions
            predictions = self.scaler.inverse_transform(dummy)[:, -1]

            if current_price is None:
                current_price = (
                    data["price"].iloc[-1]
                    if "price" in data.columns
                    else predictions[0]
                )

            final_price = predictions[-1]
            price_change_pct = ((final_price - current_price) / current_price) * 100

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

        if "price" in data.columns and len(data) >= 2:
            momentum = (
                (data["price"].iloc[-1] - data["price"].iloc[-12])
                / data["price"].iloc[-12]
                if len(data) >= 12
                else 0
            )
            predicted_change = momentum * 0.5 * 100
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
                print(f"Anomaly detection model loaded from {self.checkpoint_path}")
            else:
                print(f"Warning: Checkpoint not found at {self.checkpoint_path}")
                self.model_loaded = False

        except Exception as e:
            print(f"Error loading anomaly model: {e}")
            self.model_loaded = False

    def preprocess(self, data: pd.DataFrame) -> np.ndarray:
        """Preprocess input data for anomaly detection"""
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

        for col in feature_cols:
            if col not in data.columns:
                data[col] = 0.0

        features = data[feature_cols].values.astype(np.float32)
        features = self.scaler.fit_transform(features)
        return features

    def detect(self, data: pd.DataFrame) -> AnomalyResult:
        """Detect anomalies in token data"""
        if not self.model_loaded:
            self.load_model()

        try:
            features = self.preprocess(data)

            if len(features) < self.seq_len:
                pad_len = self.seq_len - len(features)
                features = np.vstack([np.tile(features[0], (pad_len, 1)), features])

            features = features[-self.seq_len :]
            x = torch.FloatTensor(features).unsqueeze(0).to(self.device)

            if not self.model_loaded:
                raise RuntimeError("Anomaly model unavailable")

            with torch.no_grad():
                output = self.model(x, None, None, None)

            reconstructed = output[0].cpu().numpy()
            mse = np.mean((features - reconstructed) ** 2, axis=1)
            threshold = np.quantile(mse, 1 - self.anomaly_ratio)
            is_anomaly = mse > threshold
            anomaly_indices = np.where(is_anomaly)[0].tolist()
            anomaly_ratio = float(np.mean(is_anomaly))

            if anomaly_ratio > 0.2:
                interpretation = (
                    f"High anomaly rate ({anomaly_ratio * 100:.1f}%) - significant market irregularities detected"
                )
            elif anomaly_ratio > 0.1:
                interpretation = (
                    f"Moderate anomaly rate ({anomaly_ratio * 100:.1f}%) - some unusual activity present"
                )
            elif anomaly_ratio > 0:
                interpretation = (
                    f"Low anomaly rate ({anomaly_ratio * 100:.1f}%) - minor irregularities detected"
                )
            else:
                interpretation = "No significant anomalies detected. Market behavior appears normal."

            return AnomalyResult(
                anomaly_scores=mse.tolist(),
                is_anomaly=is_anomaly.tolist(),
                anomaly_ratio=anomaly_ratio,
                max_anomaly_score=float(np.max(mse)) if len(mse) else 0.0,
                anomaly_indices=anomaly_indices,
                interpretation=interpretation,
            )

        except Exception as e:
            print(f"Anomaly detection error: {e}")
            return AnomalyResult(
                anomaly_scores=[0.0] * min(len(data), self.seq_len),
                is_anomaly=[False] * min(len(data), self.seq_len),
                anomaly_ratio=0.0,
                max_anomaly_score=0.0,
                anomaly_indices=[],
                interpretation="Unable to compute anomalies - returning safe default.",
            )


class TimesNetService:
    """Combined TimesNet service for forecasting and anomaly detection"""

    def __init__(self):
        self.forecaster = TimesNetForecaster()
        self.anomaly_detector = TimesNetAnomalyDetector()
        self.version = "2.0.0"
        self.is_ready = False

    def initialize(self):
        """Initialize service models"""
        self.forecaster.load_model()
        self.anomaly_detector.load_model()
        self.is_ready = True

    def _build_prediction_output(
        self, forecast: ForecastResult, current_price: Optional[float]
    ) -> Dict:
        baseline_price = float(current_price) if current_price else 0.0
        predicted_prices = forecast.predicted_prices[: max(forecast.forecast_horizon, 16)]
        if not predicted_prices:
            predicted_prices = [baseline_price]

        return_30m_index = min(len(predicted_prices), 2) - 1
        return_4h_index = min(len(predicted_prices), 16) - 1
        price_30m = predicted_prices[return_30m_index]
        price_4h = predicted_prices[return_4h_index]
        window_4h = predicted_prices[:16]

        if baseline_price > 0:
            expected_return_30m = ((price_30m - baseline_price) / baseline_price) * 100
            expected_return_4h = ((price_4h - baseline_price) / baseline_price) * 100
            min_price_4h = min(window_4h) if window_4h else baseline_price
            expected_drawdown_4h = max(
                0.0, ((baseline_price - min_price_4h) / baseline_price) * 100
            )
        else:
            expected_return_30m = 0.0
            expected_return_4h = 0.0
            expected_drawdown_4h = 0.0

        if abs(expected_return_4h) < 1:
            confidence = 0.5
        else:
            confidence = min(0.95, 0.5 + abs(expected_return_4h) / 20)

        copy_risk_score = max(
            0.0,
            min(1.0, 0.35 + expected_drawdown_4h / 20 - expected_return_4h / 40),
        )

        reason_codes: List[str] = []
        if expected_return_30m >= 1:
            reason_codes.append("short_term_return_positive")
        elif expected_return_30m <= -1:
            reason_codes.append("short_term_return_negative")
        else:
            reason_codes.append("short_term_return_flat")

        if expected_return_4h >= 2:
            reason_codes.append("medium_term_return_positive")
        elif expected_return_4h <= -2:
            reason_codes.append("medium_term_return_negative")
        else:
            reason_codes.append("medium_term_return_flat")

        if expected_drawdown_4h >= 5:
            reason_codes.append("drawdown_elevated")
        elif expected_drawdown_4h > 0:
            reason_codes.append("drawdown_present")
        else:
            reason_codes.append("drawdown_limited")

        if confidence >= 0.75:
            reason_codes.append("confidence_high")
        elif confidence >= 0.6:
            reason_codes.append("confidence_medium")
        else:
            reason_codes.append("confidence_low")

        return {
            "modelVersion": self.version,
            "copyRiskScore": round(float(copy_risk_score), 4),
            "expectedReturn30m": round(float(expected_return_30m), 4),
            "expectedReturn4h": round(float(expected_return_4h), 4),
            "expectedDrawdown4h": round(float(expected_drawdown_4h), 4),
            "confidence": round(float(confidence), 4),
            "reasonCodes": reason_codes,
        }

    def _prediction_signal(self, prediction: Dict) -> str:
        if prediction["expectedReturn4h"] > 1 and prediction["copyRiskScore"] < 0.4:
            return "bullish"
        if prediction["expectedReturn4h"] < -1:
            return "bearish"
        if prediction["copyRiskScore"] >= 0.7:
            return "high_risk"
        return "neutral"

    def get_full_analysis(
        self, data: pd.DataFrame, token_symbol: str, current_price: float = None
    ) -> Dict:
        """
        Get complete TimesNet analysis combining forecast and anomaly detection.
        """
        forecast = self.forecaster.predict(data, current_price)
        anomalies = self.anomaly_detector.detect(data)
        prediction = self._build_prediction_output(forecast, current_price)

        return {
            "token": token_symbol,
            "timestamp": pd.Timestamp.now().isoformat(),
            "model_version": self.version,
            "prediction": prediction,
            "anomaly_detection": {
                "anomaly_ratio": anomalies.anomaly_ratio,
                "max_anomaly_score": anomalies.max_anomaly_score,
                "recent_anomalies": sum(anomalies.is_anomaly[-12:])
                if len(anomalies.is_anomaly) >= 12
                else sum(anomalies.is_anomaly),
                "interpretation": anomalies.interpretation,
            },
            "combined_signal": self._generate_combined_signal(prediction, anomalies),
        }

    def _generate_combined_signal(
        self, prediction: Dict, anomalies: AnomalyResult
    ) -> Dict:
        """Generate combined trading signal from prediction and anomaly detection"""

        signal = self._prediction_signal(prediction)
        if signal == "bullish" and prediction["confidence"] > 0.6:
            strength = prediction["confidence"] * (1 - prediction["copyRiskScore"])
        elif signal == "bearish" and prediction["confidence"] > 0.6:
            strength = prediction["confidence"]
        else:
            strength = max(0.3, 1 - prediction["copyRiskScore"])

        warnings = []

        if anomalies.anomaly_ratio > 0.2:
            strength *= 0.7
            warnings.append("High anomaly rate detected - proceed with caution")

        recent_anomalies = (
            sum(anomalies.is_anomaly[-6:]) if len(anomalies.is_anomaly) >= 6 else 0
        )
        if recent_anomalies >= 3:
            warnings.append(
                "Recent anomaly cluster - possible whale activity or market manipulation"
            )

        if (
            signal == "bullish"
            and strength > 0.4
            and anomalies.anomaly_ratio < 0.15
        ):
            action = "consider_buy"
            reasoning = (
                f"Positive 4h return estimate ({prediction['expectedReturn4h']:+.2f}%) "
                f"with controlled copy risk ({prediction['copyRiskScore']:.2f})"
            )
        elif (
            signal == "bearish"
            and strength > 0.6
            and anomalies.anomaly_ratio < 0.15
        ):
            action = "consider_sell"
            reasoning = (
                f"Negative 4h return estimate ({prediction['expectedReturn4h']:+.2f}%) "
                f"with {prediction['confidence'] * 100:.0f}% confidence"
            )
        elif anomalies.anomaly_ratio > 0.2:
            action = "monitor"
            reasoning = "Unusual market activity detected - monitoring recommended"
        else:
            action = "hold"
            reasoning = (
                f"No strong edge: 4h return {prediction['expectedReturn4h']:+.2f}% and "
                f"copy risk {prediction['copyRiskScore']:.2f}"
            )

        return {
            "signal": signal,
            "strength": round(min(max(float(strength), 0.0), 1.0), 3),
            "action": action,
            "reasoning": reasoning,
            "warnings": warnings,
        }


_service_instance = None


def get_timesnet_service() -> TimesNetService:
    """Get or create the TimesNet service singleton"""
    global _service_instance
    if _service_instance is None:
        _service_instance = TimesNetService()
        _service_instance.initialize()
    return _service_instance
