"""
TimesNet Service for Smart Money Analysis
Provides time series prediction and anomaly detection for token price movements
Integrates with LLM for intelligent analysis interpretation
"""

import os
import json
import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import numpy as np
import pandas as pd
from datetime import datetime
from contextlib import asynccontextmanager

from models.timesnet_inference import (
    get_timesnet_service,
    TimesNetService,
    ForecastResult,
    AnomalyResult,
)


# LLM Configuration
LLM_PROXY_URL = os.getenv("LLM_PROXY_URL", "http://localhost:3000/api/chat")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-sonnet")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models on startup"""
    print("Initializing TimesNet models...")
    service = get_timesnet_service()
    print(f"TimesNet service ready: {service.is_ready}")
    yield
    print("Shutting down TimesNet service...")


app = FastAPI(
    title="TimesNet Prediction Service",
    description="Time series forecasting and anomaly detection for Solana token prices with LLM integration",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== Request/Response Models ==============


class TokenData(BaseModel):
    """Historical token data for analysis"""

    date: Optional[List[str]] = None
    price: List[float]
    volume: Optional[List[float]] = None
    price_change_1h: Optional[List[float]] = None
    price_change_4h: Optional[List[float]] = None
    volatility_1h: Optional[List[float]] = None
    volatility_4h: Optional[List[float]] = None
    rsi_14: Optional[List[float]] = None
    macd: Optional[List[float]] = None
    bb_position: Optional[List[float]] = None
    momentum_1h: Optional[List[float]] = None
    price_sma_ratio: Optional[List[float]] = None
    smart_money_flow: Optional[List[float]] = None
    buy_sell_ratio: Optional[List[float]] = None
    sm_confidence: Optional[List[float]] = None
    whale_activity: Optional[List[float]] = None
    large_tx_count: Optional[List[float]] = None


class PredictionRequest(BaseModel):
    """Request model for predictions"""

    token_address: str
    token_symbol: str
    data: TokenData
    include_llm_analysis: bool = True
    horizon: int = Field(
        default=12, ge=1, le=48, description="Forecast horizon in periods (15min each)"
    )


class PredictionOutput(BaseModel):
    modelVersion: str
    copyRiskScore: float = Field(ge=0.0, le=1.0)
    expectedReturn30m: float
    expectedReturn4h: float
    expectedDrawdown4h: float = Field(ge=0.0)
    confidence: float = Field(ge=0.0, le=1.0)
    reasonCodes: List[str]


class ForecastResponse(BaseModel):
    """Response for forecast endpoint"""

    token_address: str
    token_symbol: str
    prediction: PredictionOutput
    timestamp: str


class AnomalyResponse(BaseModel):
    """Response for anomaly detection endpoint"""

    token_address: str
    token_symbol: str
    anomaly_ratio: float
    max_anomaly_score: float
    recent_anomalies: int
    interpretation: str
    anomaly_indices: List[int]
    model_version: str
    timestamp: str


class FullAnalysisResponse(BaseModel):
    """Response for full analysis endpoint"""

    token_address: str
    token_symbol: str
    prediction: PredictionOutput
    anomaly_detection: Dict[str, Any]
    combined_signal: Dict[str, Any]
    llm_analysis: Optional[str] = None
    timestamp: str


class HealthResponse(BaseModel):
    status: str
    models_loaded: Dict[str, bool]
    version: str


# ============== Helpers ==============


def build_prediction_output(
    predicted_prices: List[float], current_price: float, model_version: str
) -> Dict[str, Any]:
    baseline_price = float(current_price) if current_price else 0.0
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
        0.0, min(1.0, 0.35 + expected_drawdown_4h / 20 - expected_return_4h / 40)
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
        "modelVersion": model_version,
        "copyRiskScore": round(float(copy_risk_score), 4),
        "expectedReturn30m": round(float(expected_return_30m), 4),
        "expectedReturn4h": round(float(expected_return_4h), 4),
        "expectedDrawdown4h": round(float(expected_drawdown_4h), 4),
        "confidence": round(float(confidence), 4),
        "reasonCodes": reason_codes,
    }


def prediction_signal(prediction: Dict[str, Any]) -> str:
    if prediction["expectedReturn4h"] > 1 and prediction["copyRiskScore"] < 0.4:
        return "bullish"
    if prediction["expectedReturn4h"] < -1:
        return "bearish"
    if prediction["copyRiskScore"] >= 0.7:
        return "high_risk"
    return "neutral"


# ============== LLM Integration ==============


async def get_llm_analysis(
    token_symbol: str, prediction: Dict, anomalies: Dict, combined_signal: Dict
) -> str:
    """
    Get LLM interpretation of TimesNet results
    """

    prompt = f"""Analyze the following TimesNet model predictions for {token_symbol}:

**Prediction Output:**
- Copy Risk Score: {prediction["copyRiskScore"]:.2f}
- Expected Return (30m): {prediction["expectedReturn30m"]:+.2f}%
- Expected Return (4h): {prediction["expectedReturn4h"]:+.2f}%
- Expected Drawdown (4h): {prediction["expectedDrawdown4h"]:.2f}%
- Confidence: {prediction["confidence"] * 100:.1f}%
- Reason Codes: {", ".join(prediction["reasonCodes"])}

**Anomaly Detection:**
- Anomaly Ratio: {anomalies["anomaly_ratio"] * 100:.1f}%
- Recent Anomalies (last 3h): {anomalies["recent_anomalies"]}
- Interpretation: {anomalies["interpretation"]}

**Combined Signal:**
- Signal: {combined_signal["signal"]}
- Strength: {combined_signal["strength"] * 100:.1f}%
- Recommended Action: {combined_signal["action"]}
- Reasoning: {combined_signal["reasoning"]}
- Warnings: {", ".join(combined_signal["warnings"]) if combined_signal["warnings"] else "None"}

Please provide a concise analysis (2-3 sentences) interpreting these results for a trader. Focus on actionable insights and risk factors."""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                LLM_PROXY_URL,
                json={
                    "modelId": LLM_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.7,
                    "maxTokens": 300,
                },
            )

            if response.status_code == 200:
                result = response.json()
                if result.get("success") and result.get("data", {}).get("content"):
                    return result["data"]["content"]

            return (
                f"TimesNet estimates {prediction['expectedReturn4h']:+.2f}% over 4h with "
                f"{prediction['confidence'] * 100:.0f}% confidence and copy risk "
                f"{prediction['copyRiskScore']:.2f}. {combined_signal['reasoning']}"
            )

    except Exception as e:
        print(f"LLM analysis error: {e}")
        return (
            f"TimesNet estimates {prediction['expectedReturn4h']:+.2f}% over 4h with "
            f"{prediction['confidence'] * 100:.0f}% confidence and copy risk "
            f"{prediction['copyRiskScore']:.2f}. {combined_signal['reasoning']}"
        )


def data_to_dataframe(data: TokenData) -> pd.DataFrame:
    """Convert TokenData to pandas DataFrame"""
    df_dict = {"price": data.price}

    optional_fields = [
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
        "whale_activity",
        "large_tx_count",
    ]

    for field in optional_fields:
        value = getattr(data, field, None)
        if value is not None:
            df_dict[field] = value

    df = pd.DataFrame(df_dict)

    if "OT" not in df.columns:
        df["OT"] = df["price"].shift(-1).fillna(df["price"].iloc[-1])

    if "volume_ma_ratio" not in df.columns and "volume" in df.columns:
        ma = df["volume"].rolling(24, min_periods=1).mean()
        df["volume_ma_ratio"] = df["volume"] / ma.replace(0, 1)

    return df


# ============== API Endpoints ==============


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check service health and model status"""
    service = get_timesnet_service()
    return HealthResponse(
        status="healthy",
        models_loaded={
            "forecaster": service.forecaster.model_loaded,
            "anomaly_detector": service.anomaly_detector.model_loaded,
        },
        version=service.version,
    )


@app.post("/forecast", response_model=ForecastResponse)
async def forecast(request: PredictionRequest):
    """
    Generate risk-oriented prediction output for a token.
    """
    try:
        service = get_timesnet_service()
        df = data_to_dataframe(request.data)

        if len(df) < 10:
            raise HTTPException(
                status_code=400, detail="Need at least 10 data points for forecast"
            )

        current_price = df["price"].iloc[-1]
        result = service.forecaster.predict(df, current_price)
        prediction = build_prediction_output(
            result.predicted_prices[: max(request.horizon, 16)],
            current_price,
            service.version,
        )

        return ForecastResponse(
            token_address=request.token_address,
            token_symbol=request.token_symbol,
            prediction=PredictionOutput(**prediction),
            timestamp=datetime.utcnow().isoformat(),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")


@app.post("/anomaly", response_model=AnomalyResponse)
async def detect_anomalies(request: PredictionRequest):
    """
    Detect anomalies in token trading data.
    """
    try:
        service = get_timesnet_service()
        df = data_to_dataframe(request.data)

        if len(df) < 20:
            raise HTTPException(
                status_code=400,
                detail="Need at least 20 data points for anomaly detection",
            )

        result = service.anomaly_detector.detect(df)

        return AnomalyResponse(
            token_address=request.token_address,
            token_symbol=request.token_symbol,
            anomaly_ratio=round(result.anomaly_ratio, 4),
            max_anomaly_score=round(result.max_anomaly_score, 4),
            recent_anomalies=sum(result.is_anomaly[-12:])
            if len(result.is_anomaly) >= 12
            else sum(result.is_anomaly),
            interpretation=result.interpretation,
            anomaly_indices=result.anomaly_indices[-20:],
            model_version=service.version,
            timestamp=datetime.utcnow().isoformat(),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Anomaly detection failed: {str(e)}"
        )


@app.post("/analyze", response_model=FullAnalysisResponse)
async def full_analysis(request: PredictionRequest):
    """
    Get complete TimesNet analysis with LLM interpretation.
    """
    try:
        service = get_timesnet_service()
        df = data_to_dataframe(request.data)

        if len(df) < 20:
            raise HTTPException(
                status_code=400, detail="Need at least 20 data points for full analysis"
            )

        current_price = df["price"].iloc[-1]
        analysis = service.get_full_analysis(df, request.token_symbol, current_price)

        llm_analysis = None
        if request.include_llm_analysis:
            llm_analysis = await get_llm_analysis(
                request.token_symbol,
                analysis["prediction"],
                analysis["anomaly_detection"],
                analysis["combined_signal"],
            )

        return FullAnalysisResponse(
            token_address=request.token_address,
            token_symbol=request.token_symbol,
            prediction=PredictionOutput(**analysis["prediction"]),
            anomaly_detection=analysis["anomaly_detection"],
            combined_signal=analysis["combined_signal"],
            llm_analysis=llm_analysis,
            timestamp=analysis["timestamp"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/")
async def root():
    """API root - returns service info and available endpoints"""
    service = get_timesnet_service()
    return {
        "service": "TimesNet Prediction Service",
        "version": service.version,
        "status": "ready" if service.is_ready else "initializing",
        "endpoints": {
            "health": "/health - Check service health",
            "forecast": "/forecast - Risk-oriented prediction output (POST)",
            "anomaly": "/anomaly - Anomaly detection (POST)",
            "analyze": "/analyze - Full analysis with LLM (POST)",
        },
        "features": [
            "Risk-oriented prediction outputs",
            "Anomaly detection for unusual trading patterns",
            "Combined trading signals",
            "LLM-powered analysis interpretation",
        ],
    }


# ============== Simple Query Endpoint (for chatbot) ==============


class SimpleQueryRequest(BaseModel):
    """Simple query request for chatbot integration"""

    token_symbol: str
    token_address: Optional[str] = None
    query_type: str = Field(
        default="full", description="Query type: 'forecast', 'anomaly', or 'full'"
    )
    price_history: List[float] = Field(
        description="Recent price history (at least 48 data points for best results)"
    )
    volume_history: Optional[List[float]] = None


class SimpleQueryResponse(BaseModel):
    """Simple query response for chatbot"""

    token_symbol: str
    summary: str
    signal: str
    confidence: float
    details: Dict[str, Any]


@app.post("/query", response_model=SimpleQueryResponse)
async def simple_query(request: SimpleQueryRequest):
    """
    Simplified query endpoint for chatbot integration.
    """
    try:
        service = get_timesnet_service()

        df = pd.DataFrame({"price": request.price_history})
        if request.volume_history:
            df["volume"] = request.volume_history

        df["OT"] = df["price"].shift(-1).fillna(df["price"].iloc[-1])
        df["price_change_1h"] = df["price"].pct_change(4).fillna(0)
        df["momentum_1h"] = df["price"].diff(4).fillna(0)

        if len(df) < 20:
            raise HTTPException(status_code=400, detail="Need at least 20 price points")

        current_price = df["price"].iloc[-1]

        if request.query_type == "forecast":
            result = service.forecaster.predict(df, current_price)
            prediction = build_prediction_output(
                result.predicted_prices[:16], current_price, service.version
            )
            summary = (
                f"{request.token_symbol}: 4h return {prediction['expectedReturn4h']:+.2f}% "
                f"with copy risk {prediction['copyRiskScore']:.2f}"
            )
            signal = prediction_signal(prediction)
            confidence = prediction["confidence"]
            details = {
                "prediction": prediction,
                "forecast_horizon_hours": result.forecast_horizon * 0.25,
            }

        elif request.query_type == "anomaly":
            result = service.anomaly_detector.detect(df)
            summary = f"{request.token_symbol}: {result.interpretation}"
            signal = "alert" if result.anomaly_ratio > 0.15 else "normal"
            confidence = 1 - result.anomaly_ratio
            details = {
                "anomaly_ratio": result.anomaly_ratio,
                "recent_anomalies": sum(result.is_anomaly[-12:]),
            }

        else:
            analysis = service.get_full_analysis(
                df, request.token_symbol, current_price
            )

            llm_summary = await get_llm_analysis(
                request.token_symbol,
                analysis["prediction"],
                analysis["anomaly_detection"],
                analysis["combined_signal"],
            )

            summary = llm_summary
            signal = analysis["combined_signal"]["signal"]
            confidence = analysis["combined_signal"]["strength"]
            details = {
                "prediction": analysis["prediction"],
                "anomaly": analysis["anomaly_detection"],
                "action": analysis["combined_signal"]["action"],
            }

        return SimpleQueryResponse(
            token_symbol=request.token_symbol,
            summary=summary,
            signal=signal,
            confidence=round(confidence, 3),
            details=details,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5623)
