import asyncio
import hmac
import json
import logging
from contextlib import suppress
from dataclasses import dataclass
from urllib.parse import urlparse

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import InlineKeyboardMarkup, Update
from aiohttp import ClientSession, web

from .config import Config
from .gateway import Gateway

log = logging.getLogger("maystroon.bot")


@dataclass
class RuntimeHealth:
    ready: bool = False


CONFIG = web.AppKey("config", Config)
BOT = web.AppKey("bot", Bot)
GATEWAY = web.AppKey("gateway", Gateway)
HEALTH = web.AppKey("health", RuntimeHealth)


def private_update(raw: dict) -> dict | None:
    update = Update.model_validate(raw)
    message = update.callback_query.message if update.callback_query else update.message
    sender = (
        update.callback_query.from_user
        if update.callback_query
        else (message.from_user if message else None)
    )
    if (
        not message
        or not sender
        or sender.is_bot
        or message.chat.type != "private"
        or message.chat.id != sender.id
    ):
        return None
    return update.model_dump(mode="json", by_alias=True, exclude_none=True)


async def deliver(bot, gateway, item: dict):
    body = item["body"]
    keyboard = body.get("keyboard")
    if keyboard:
        for row in keyboard:
            for button in row:
                if button.get("url") and urlparse(button["url"]).scheme != "https":
                    raise ValueError("DELIVERY_URL_INVALID")
        markup = InlineKeyboardMarkup.model_validate({"inline_keyboard": keyboard})
    else:
        markup = None
    message_id = None
    error = None
    try:
        if body.get("edit_message_id"):
            try:
                await bot.edit_message_text(
                    chat_id=item["telegram_id"],
                    message_id=body["edit_message_id"],
                    text=body["text"],
                    reply_markup=markup,
                )
                message_id = body["edit_message_id"]
            except TelegramBadRequest as exc:
                if "message is not modified" in str(exc).lower():
                    message_id = body["edit_message_id"]
                else:
                    sent = await bot.send_message(
                        item["telegram_id"], body["text"], reply_markup=markup
                    )
                    message_id = sent.message_id
        else:
            sent = await bot.send_message(
                item["telegram_id"], body["text"], reply_markup=markup
            )
            message_id = sent.message_id
    except Exception:  # noqa: BLE001 - Sanitize credential-bearing transport errors.
        error = "TELEGRAM_DELIVERY_FAILED"
    await gateway.call(
        "ack",
        {
            "id": item["id"],
            "lease": item["lease_token"],
            "message_id": message_id,
            "error": error,
        },
    )


async def worker(app):
    backoff = 2
    while True:
        try:
            data = await app[GATEWAY].call("work", {})
            app[HEALTH].ready = True
            for item in data.get("deliveries", []):
                await deliver(app[BOT], app[GATEWAY], item)
            backoff = 2
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - Sanitize credential-bearing transport errors.
            app[HEALTH].ready = False
            log.warning(json.dumps({"event": "AUTOMATION_REQUEST_FAILED"}))
            backoff = min(60, backoff * 2)
        await asyncio.sleep(backoff)


async def webhook(request):
    expected = request.app[CONFIG].webhook_secret.get_secret_value()
    if not hmac.compare_digest(
        request.headers.get("X-Telegram-Bot-Api-Secret-Token", ""), expected
    ):
        return web.json_response({"error": "UNAUTHORIZED"}, status=401)
    try:
        raw = await request.json()
        update = private_update(raw)
        if not update:
            return web.json_response({"accepted": False})
        # Durable ingestion must complete before acknowledging Telegram's update.
        await request.app[GATEWAY].call("updates", update)
        if update.get("callback_query"):
            with suppress(Exception):
                await request.app[BOT].answer_callback_query(
                    update["callback_query"]["id"], text="جارٍ المعالجة…"
                )
        return web.json_response({"accepted": True})
    except (ValueError, TypeError):
        return web.json_response({"error": "INVALID_UPDATE"}, status=400)
    except Exception:  # noqa: BLE001 - Sanitize credential-bearing transport errors.
        log.warning(json.dumps({"event": "WEBHOOK_INGEST_FAILED"}))
        return web.json_response({"error": "RETRY_LATER"}, status=503)


async def polling(app):
    offset, backoff = None, 2
    while True:
        try:
            updates = await app[BOT].get_updates(
                offset=offset, timeout=20, allowed_updates=["message", "callback_query"]
            )
            for update in updates:
                raw = private_update(
                    update.model_dump(mode="json", by_alias=True, exclude_none=True)
                )
                if raw:
                    await app[GATEWAY].call("updates", raw)
                offset = update.update_id + 1
            backoff = 2
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - Sanitize credential-bearing transport errors.
            app[HEALTH].ready = False
            log.warning(json.dumps({"event": "POLLING_REQUEST_FAILED"}))
            await asyncio.sleep(backoff)
            backoff = min(60, backoff * 2)


def create_app(config: Config, bot=None, gateway=None, start_runtime=True):
    app = web.Application(client_max_size=100000)
    app[CONFIG] = config
    app[HEALTH] = RuntimeHealth()
    app.router.add_post("/webhook", webhook)

    async def health(_request):
        return web.json_response(
            {
                "status": "ready" if app[HEALTH].ready else "degraded",
                "mode": config.mode,
            },
            status=200 if app[HEALTH].ready else 503,
        )

    app.router.add_get("/health", health)

    async def runtime(application):
        session = ClientSession()
        application[BOT] = bot or Bot(config.bot_token.get_secret_value())
        application[GATEWAY] = gateway or Gateway(config, session)
        tasks = []
        try:
            if start_runtime:
                await application[BOT].get_me()
                await application[GATEWAY].call("health", {})
                application[HEALTH].ready = True
                if config.mode == "webhook":
                    await application[BOT].set_webhook(
                        config.webhook_url,
                        secret_token=config.webhook_secret.get_secret_value(),
                        allowed_updates=["message", "callback_query"],
                        max_connections=1,
                        drop_pending_updates=False,
                    )
                else:
                    await application[BOT].delete_webhook(drop_pending_updates=False)
                    tasks.append(asyncio.create_task(polling(application)))
                tasks.append(asyncio.create_task(worker(application)))
            yield
        finally:
            for task in tasks:
                task.cancel()
            for task in tasks:
                with suppress(asyncio.CancelledError):
                    await task
            await application[BOT].session.close()
            await session.close()

    app.cleanup_ctx.append(runtime)
    return app


def main():
    logging.basicConfig(level=logging.WARNING)
    logging.getLogger("aiohttp.access").disabled = True
    try:
        config = Config.from_env()
        web.run_app(
            create_app(config),
            host="0.0.0.0",
            port=config.port,
            print=None,
            access_log=None,
        )
    except Exception:  # noqa: BLE001 - Sanitize credential-bearing transport errors.
        log.error(json.dumps({"event": "CONFIGURATION_OR_STARTUP_FAILED"}))
        raise SystemExit(1) from None
