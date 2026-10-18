FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY services/telegram-bot/requirements.lock ./requirements.lock
RUN pip install --no-cache-dir -r requirements.lock && useradd --create-home bot
COPY services/telegram-bot/maystroon_bot ./maystroon_bot
USER bot
CMD ["python", "-m", "maystroon_bot"]
