import unittest
from unittest.mock import AsyncMock

from aiohttp.test_utils import TestClient, TestServer
from maystroon_bot.app import create_app, deliver, private_update
from maystroon_bot.config import Config
from maystroon_bot.gateway import GatewayError, sign
from pydantic import ValidationError


def config(**changes):
    return Config(
        bot_token="fixture-not-a-live-token",
        webhook_secret="w" * 32,
        gateway_secret="g" * 32,
        site_url="https://site.example.test",
        webhook_url="https://bot.example.test/webhook",
        **changes,
    )


def update(chat_type="private"):
    return {
        "update_id": 1,
        "message": {
            "message_id": 1,
            "date": 0,
            "chat": {"id": 123, "type": chat_type},
            "from": {"id": 123, "is_bot": False, "first_name": "اختبار"},
            "text": "/start",
        },
    }


class ConfigTests(unittest.TestCase):
    def test_secrets_are_redacted(self):
        value = config()
        self.assertNotIn("w" * 32, repr(value))
        self.assertNotIn("fixture-not-a-live-token", repr(value))

    def test_runtime_requires_https(self):
        with self.assertRaises(ValidationError):
            Config(
                bot_token="fixture",
                webhook_secret="w" * 32,
                gateway_secret="g" * 32,
                site_url="http://169.254.169.254",
                webhook_url="https://bot.example.test/webhook",
            )

    def test_private_chat_identity_is_required(self):
        self.assertIsNotNone(private_update(update()))
        self.assertIsNone(private_update(update("group")))
        raw = update()
        raw["message"]["from"]["id"] = 456
        self.assertIsNone(private_update(raw))

    def test_signature_is_bound_to_path_and_body(self):
        value = sign("x" * 32, "1792100000", "n" * 32, "/work", "{}")
        self.assertEqual(len(value), 64)
        self.assertNotEqual(value, sign("x" * 32, "1792100000", "n" * 32, "/ack", "{}"))
        self.assertNotEqual(
            value, sign("x" * 32, "1792100000", "n" * 32, "/work", "{ }")
        )


class WebhookTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.bot = AsyncMock()
        self.gateway = AsyncMock()
        self.gateway.call.return_value = {"accepted": True}
        self.app = create_app(
            config(), bot=self.bot, gateway=self.gateway, start_runtime=False
        )
        self.client = TestClient(TestServer(self.app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.bot.session.close.assert_awaited_once()

    async def test_rejects_missing_webhook_secret(self):
        response = await self.client.post("/webhook", json=update())
        self.assertEqual(response.status, 401)
        self.gateway.call.assert_not_awaited()

    async def test_durable_ingestion_precedes_acknowledgement(self):
        response = await self.client.post(
            "/webhook",
            json=update(),
            headers={"X-Telegram-Bot-Api-Secret-Token": "w" * 32},
        )
        self.assertEqual(response.status, 200)
        self.assertEqual((await response.json())["accepted"], True)
        self.gateway.call.assert_awaited_once()
        self.assertEqual(self.gateway.call.await_args.args[0], "updates")

    async def test_group_update_never_reaches_administrative_service(self):
        response = await self.client.post(
            "/webhook",
            json=update("group"),
            headers={"X-Telegram-Bot-Api-Secret-Token": "w" * 32},
        )
        self.assertFalse((await response.json())["accepted"])
        self.gateway.call.assert_not_awaited()

    async def test_storage_failure_requests_telegram_retry(self):
        self.gateway.call.side_effect = GatewayError("fixture database failure")
        response = await self.client.post(
            "/webhook",
            json=update(),
            headers={"X-Telegram-Bot-Api-Secret-Token": "w" * 32},
        )
        self.assertEqual(response.status, 503)
        self.assertNotIn("fixture", await response.text())

    async def test_invalid_payload_is_rejected_without_trace(self):
        response = await self.client.post(
            "/webhook",
            json={"update_id": "bad"},
            headers={"X-Telegram-Bot-Api-Secret-Token": "w" * 32},
        )
        self.assertEqual(response.status, 400)
        self.assertEqual((await response.json())["error"], "INVALID_UPDATE")

    async def test_health_is_not_fabricated_when_backend_is_unavailable(self):
        response = await self.client.get("/health")
        self.assertEqual(response.status, 503)
        self.assertEqual((await response.json())["status"], "degraded")

    async def test_delivery_is_plain_text_and_acknowledged(self):
        self.bot.send_message.return_value.message_id = 42
        await deliver(
            self.bot,
            self.gateway,
            {
                "id": "delivery",
                "lease_token": "lease",
                "telegram_id": 123,
                "body": {"text": "<script>نص غير موثوق</script>"},
            },
        )
        self.assertNotIn("parse_mode", self.bot.send_message.await_args.kwargs)
        self.assertEqual(self.gateway.call.await_args.args[1]["message_id"], 42)

    async def test_delivery_failure_never_logs_token_or_error_body(self):
        self.bot.send_message.side_effect = RuntimeError("secret-token-never-show")
        await deliver(
            self.bot,
            self.gateway,
            {
                "id": "delivery",
                "lease_token": "lease",
                "telegram_id": 123,
                "body": {"text": "نص"},
            },
        )
        self.assertEqual(
            self.gateway.call.await_args.args[1]["error"], "TELEGRAM_DELIVERY_FAILED"
        )
        self.assertNotIn("secret-token", str(self.gateway.call.await_args))
