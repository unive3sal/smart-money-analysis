"""
Data Pipeline for TimesNet Training
Converts extracted features to training-ready format
"""

import json
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import os


@dataclass
class TimesNetDataRow:
    """Single row of training data for TimesNet"""
    timestamp: int
    token_address: str
    
    # Target variable (what we're predicting)
    price_change_24h: float  # % change in next 24h
    
    # Price features
    price_current: float
    price_change_1h: float
    price_change_4h: float
    price_change_12h: float
    volume_24h: float
    volume_change_24h: float
    
    # Smart money aggregate features
    sm_net_flow_24h: float  # Net buying - selling in USD
    sm_unique_buyers: int
    sm_unique_sellers: int
    sm_avg_position_size: float
    sm_top_wallet_action: int  # -1: sell, 0: hold, 1: buy
    sm_avg_win_rate: float
    
    # Token fundamentals
    token_mcap: float
    token_liquidity: float
    token_holder_count: int
    token_age_hours: int
    
    # Optional media features
    twitter_mentions: Optional[int] = None
    twitter_sentiment: Optional[float] = None
    trending_rank: Optional[int] = None


class DataPipeline:
    """
    Pipeline to generate TimesNet training data from raw API responses
    """
    
    def __init__(self, output_dir: str = "./data"):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def process_birdeye_data(
        self,
        token_data: Dict,
        wallet_features: List[Dict],
        price_history: List[Dict],
    ) -> List[TimesNetDataRow]:
        """
        Process Birdeye API data into training rows
        
        Args:
            token_data: Token info from Birdeye
            wallet_features: List of extracted wallet features
            price_history: Historical price data
            
        Returns:
            List of TimesNetDataRow objects
        """
        
        rows = []
        
        # Sort price history by timestamp
        sorted_prices = sorted(price_history, key=lambda x: x.get("unixTime", 0))
        
        # Generate a row for each historical point (excluding last 24h for target calculation)
        for i in range(24, len(sorted_prices) - 24):  # Need 24h before and after
            current = sorted_prices[i]
            current_price = current.get("value", 0)
            current_time = current.get("unixTime", 0)
            
            if current_price <= 0:
                continue
            
            # Calculate target (24h forward price change)
            future_price = sorted_prices[i + 24].get("value", current_price)
            price_change_24h = ((future_price - current_price) / current_price) * 100
            
            # Calculate historical price changes
            price_1h_ago = sorted_prices[i - 1].get("value", current_price) if i >= 1 else current_price
            price_4h_ago = sorted_prices[i - 4].get("value", current_price) if i >= 4 else current_price
            price_12h_ago = sorted_prices[i - 12].get("value", current_price) if i >= 12 else current_price
            
            # Aggregate smart money features for this timestamp
            sm_features = self._aggregate_smart_money(wallet_features, current_time)
            
            row = TimesNetDataRow(
                timestamp=current_time,
                token_address=token_data.get("address", ""),
                price_change_24h=price_change_24h,
                price_current=current_price,
                price_change_1h=((current_price - price_1h_ago) / price_1h_ago) * 100 if price_1h_ago > 0 else 0,
                price_change_4h=((current_price - price_4h_ago) / price_4h_ago) * 100 if price_4h_ago > 0 else 0,
                price_change_12h=((current_price - price_12h_ago) / price_12h_ago) * 100 if price_12h_ago > 0 else 0,
                volume_24h=token_data.get("volume24h", 0),
                volume_change_24h=0,  # Would need historical volume
                sm_net_flow_24h=sm_features["net_flow"],
                sm_unique_buyers=sm_features["buyers"],
                sm_unique_sellers=sm_features["sellers"],
                sm_avg_position_size=sm_features["avg_position"],
                sm_top_wallet_action=sm_features["top_action"],
                sm_avg_win_rate=sm_features["avg_win_rate"],
                token_mcap=token_data.get("marketCap", 0),
                token_liquidity=token_data.get("liquidity", 0),
                token_holder_count=token_data.get("holder", 0),
                token_age_hours=self._calculate_token_age(token_data),
            )
            
            rows.append(row)
        
        return rows
    
    def _aggregate_smart_money(
        self,
        wallet_features: List[Dict],
        timestamp: int,
    ) -> Dict:
        """Aggregate smart money features at a given timestamp"""
        
        # Filter wallets active around the timestamp
        active_wallets = [
            w for w in wallet_features
            if abs(w.get("snapshotTimestamp", 0) - timestamp * 1000) < 24 * 60 * 60 * 1000
        ]
        
        if not active_wallets:
            return {
                "net_flow": 0,
                "buyers": 0,
                "sellers": 0,
                "avg_position": 0,
                "top_action": 0,
                "avg_win_rate": 0.5,
            }
        
        # Calculate aggregates
        net_flows = [w.get("recentActivity", {}).get("netFlow24h", 0) for w in active_wallets]
        win_rates = [w.get("performance", {}).get("winRate", 0.5) for w in active_wallets]
        
        buyers = sum(1 for nf in net_flows if nf > 0)
        sellers = sum(1 for nf in net_flows if nf < 0)
        
        # Top wallet action (wallet with highest win rate)
        if win_rates:
            best_wallet_idx = win_rates.index(max(win_rates))
            top_flow = net_flows[best_wallet_idx] if best_wallet_idx < len(net_flows) else 0
            top_action = 1 if top_flow > 1000 else (-1 if top_flow < -1000 else 0)
        else:
            top_action = 0
        
        return {
            "net_flow": sum(net_flows),
            "buyers": buyers,
            "sellers": sellers,
            "avg_position": sum(net_flows) / len(net_flows) if net_flows else 0,
            "top_action": top_action,
            "avg_win_rate": sum(win_rates) / len(win_rates) if win_rates else 0.5,
        }
    
    def _calculate_token_age(self, token_data: Dict) -> int:
        """Calculate token age in hours"""
        # Would need creation timestamp from token data
        # Using a placeholder
        return 168  # 7 days default
    
    def save_training_data(
        self,
        rows: List[TimesNetDataRow],
        filename: str = "training_data.json",
    ):
        """Save training data to JSON file"""
        
        filepath = os.path.join(self.output_dir, filename)
        
        data = [asdict(row) for row in rows]
        
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        
        print(f"Saved {len(rows)} training rows to {filepath}")
        return filepath
    
    def load_training_data(self, filename: str = "training_data.json") -> List[Dict]:
        """Load training data from JSON file"""
        
        filepath = os.path.join(self.output_dir, filename)
        
        with open(filepath, "r") as f:
            return json.load(f)
    
    def to_numpy(self, rows: List[TimesNetDataRow]):
        """
        Convert training data to numpy arrays for model training
        
        Returns:
            X: Feature matrix
            y: Target vector (price_change_24h)
        """
        import numpy as np
        
        feature_names = [
            "price_change_1h", "price_change_4h", "price_change_12h",
            "volume_24h", "volume_change_24h",
            "sm_net_flow_24h", "sm_unique_buyers", "sm_unique_sellers",
            "sm_avg_position_size", "sm_top_wallet_action", "sm_avg_win_rate",
            "token_mcap", "token_liquidity", "token_holder_count", "token_age_hours",
        ]
        
        X = []
        y = []
        
        for row in rows:
            row_dict = asdict(row)
            features = [row_dict[f] for f in feature_names]
            X.append(features)
            y.append(row_dict["price_change_24h"])
        
        return np.array(X), np.array(y), feature_names


# Example usage
if __name__ == "__main__":
    # Example: Generate sample training data
    pipeline = DataPipeline(output_dir="./data")
    
    # Mock data for demonstration
    token_data = {
        "address": "So11111111111111111111111111111111111111112",
        "symbol": "SOL",
        "marketCap": 50000000000,
        "volume24h": 1000000000,
        "holder": 500000,
    }
    
    # Generate mock price history (48 hours)
    import random
    base_price = 100.0
    price_history = []
    for i in range(72):  # 72 hours of data
        price = base_price * (1 + random.uniform(-0.02, 0.02))
        base_price = price
        price_history.append({
            "unixTime": 1700000000 + i * 3600,
            "value": price,
        })
    
    # Mock wallet features
    wallet_features = [
        {
            "snapshotTimestamp": 1700100000000,
            "recentActivity": {"netFlow24h": 50000},
            "performance": {"winRate": 0.65},
        },
        {
            "snapshotTimestamp": 1700100000000,
            "recentActivity": {"netFlow24h": -10000},
            "performance": {"winRate": 0.45},
        },
    ]
    
    # Process data
    rows = pipeline.process_birdeye_data(token_data, wallet_features, price_history)
    
    # Save
    if rows:
        pipeline.save_training_data(rows, "sample_training_data.json")
        print(f"Generated {len(rows)} training samples")
