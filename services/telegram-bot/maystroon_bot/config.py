import os
from urllib.parse import urlparse

from pydantic import BaseModel, Field, SecretStr, model_validator


class Config(BaseModel):
    bot_token: SecretStr
    webhook_secret: SecretStr
    gateway_secret: SecretStr
    site_url: str
    webhook_url: str | None = None
    mode: str = "webhook"
    port: int = Field(default=8080, ge=1, le=65535)
    allow_test_http: bool = False

    @model_validator(mode="after")
    def validate_runtime(self):
        for secret in (self.webhook_secret, self.gateway_secret):
            if len(secret.get_secret_value()) < 32:
                raise ValueError("CONFIG_SECRET_TOO_SHORT")
        if self.mode not in ("webhook", "polling"):
            raise ValueError("CONFIG_MODE_INVALID")
        for url in [self.site_url] + ([self.webhook_url] if self.webhook_url else []):
            parsed = urlparse(url)
            local = (
                self.allow_test_http
                and parsed.scheme == "http"
                and parsed.hostname in ("localhost", "127.0.0.1")
            )
            if (
                (parsed.scheme != "https" and not local)
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError("CONFIG_HTTPS_REQUIRED")
        if self.mode == "webhook" and not self.webhook_url:
            raise ValueError("CONFIG_WEBHOOK_REQUIRED")
        return self

    @classmethod
    def from_env(cls):
        return cls(
            bot_token=os.environ.get("TELEGRAM_BOT_TOKEN", ""),
            webhook_secret=os.environ.get("TELEGRAM_WEBHOOK_SECRET", ""),
            gateway_secret=os.environ.get("TELEGRAM_GATEWAY_SECRET", ""),
            site_url=os.environ.get("NEXT_PUBLIC_SITE_URL", ""),
            webhook_url=os.environ.get("TELEGRAM_WEBHOOK_URL"),
            mode=os.environ.get("TELEGRAM_MODE", "webhook"),
            port=int(os.environ.get("SERVER_PORT", os.environ.get("PORT", "8080"))),
        )
