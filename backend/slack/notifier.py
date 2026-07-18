import httpx
from config import SLACK_WEBHOOK_URL


async def send_slack_alert(
    customer_id: str,
    transaction_id: str,
    risk_score: float,
    detection_reason: str,
    sar_summary: str,
) -> dict:
    if not SLACK_WEBHOOK_URL:
        return {"status": "skipped", "message": "Slack webhook not configured"}

    blocks = {
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "Fraud Sentinel Alert"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Customer:*\n{customer_id}"},
                    {"type": "mrkdwn", "text": f"*Transaction:*\n{transaction_id}"},
                    {"type": "mrkdwn", "text": f"*Risk Score:*\n{risk_score:.0f}/100"},
                ],
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Detection Reason:*\n{detection_reason[:300]}"},
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*SAR Summary:*\n{sar_summary[:500]}"},
            },
        ]
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(SLACK_WEBHOOK_URL, json=blocks)
        if resp.status_code != 200:
            return {"status": "failed", "message": f"Slack returned {resp.status_code}"}

    return {"status": "sent", "message": "Slack alert sent successfully"}
