import hashlib
import hmac
import json
import secrets
import time

from aiohttp import ClientSession, ClientTimeout

from .config import Config


def sign(secret: str, timestamp: str, nonce: str, path: str, body: str) -> str:
    payload = "\n".join(
        (timestamp, nonce, path, hashlib.sha256(body.encode()).hexdigest())
    )
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


class GatewayError(Exception):
    """No response body or credential-bearing URLs are included in errors."""


class Gateway:
    def __init__(self, config: Config, session: ClientSession):
        self.config = config
        self.session = session

    async def call(self, action: str, payload: dict):
        if action not in ("updates", "work", "ack", "health"):
            raise GatewayError("GATEWAY_ACTION_INVALID")
        path = "/api/v1/internal/automation/" + action
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        timestamp, nonce = str(int(time.time())), secrets.token_hex(16)
        signature = sign(
            self.config.gateway_secret.get_secret_value(), timestamp, nonce, path, body
        )
        try:
            async with self.session.post(
                self.config.site_url.rstrip("/") + path,
                data=body.encode(),
                headers={
                    "Content-Type": "application/json",
                    "X-Maystroon-Time": timestamp,
                    "X-Maystroon-Nonce": nonce,
                    "X-Maystroon-Signature": signature,
                },
                timeout=ClientTimeout(total=55),
                allow_redirects=False,
            ) as response:
                if response.status != 200:
                    raise GatewayError("GATEWAY_REQUEST_FAILED")
                raw = await response.content.read(1000001)
                if len(raw) > 1000000:
                    raise GatewayError("GATEWAY_RESPONSE_TOO_LARGE")
                return json.loads(raw)["data"]
        except GatewayError:
            raise
        except Exception:  # noqa: BLE001 - Sanitize credential-bearing transport errors.
            raise GatewayError("GATEWAY_UNAVAILABLE") from None
