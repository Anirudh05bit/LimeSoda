import random
from dataclasses import dataclass, asdict
from typing import Any


@dataclass
class DemoScenario:
    id: str
    title: str
    description: str
    customer_id: str
    alert_type: str


SCENARIOS = [
    DemoScenario(
        id="impossible_travel",
        title="Impossible Travel",
        description="Transaction originates from two distant locations within minutes — physically impossible for the account holder.",
        customer_id="CUST-004",
        alert_type="geo_anomaly",
    ),
    DemoScenario(
        id="high_velocity",
        title="High Velocity",
        description="Multiple high-value transactions executed within a short time window, far exceeding normal activity patterns.",
        customer_id="CUST-003",
        alert_type="velocity",
    ),
    DemoScenario(
        id="structuring",
        title="Structuring",
        description="Multiple deposits consistently below the $10,000 reporting threshold, indicating deliberate evasion of CTR requirements.",
        customer_id="CUST-002",
        alert_type="structuring",
    ),
    DemoScenario(
        id="circular_laundering",
        title="Circular Money Laundering",
        description="Funds cycle through multiple accounts in a circular pattern (A→B→C→A), a classic layering technique.",
        customer_id="CUST-001",
        alert_type="fund_dispersal",
    ),
]


def get_scenario_customer_ids() -> list[str]:
    return [s.customer_id for s in SCENARIOS]


def get_scenario_by_id(scenario_id: str) -> DemoScenario | None:
    for s in SCENARIOS:
        if s.id == scenario_id:
            return s
    return None
