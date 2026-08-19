# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_APP_BASE_PATH=/account-health/
ENV VITE_APP_BASE_PATH=${VITE_APP_BASE_PATH}
RUN npm run build

FROM python:3.12-slim AS runtime
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY --from=frontend-build /app/dist ./dist
EXPOSE 4000
ENV PORT=4000
ENV APP_BASE_PATH=
ENV SERVER_DATA_MODE=mock
# Provide secrets and integration settings at runtime, for example via
# `docker run --env-file .env.server ...` or your deployment platform's env config:
# GOOGLE_SHEETS_SPREADSHEET_ID
# GOOGLE_SERVICE_ACCOUNT_EMAIL
# GOOGLE_PRIVATE_KEY
# CRUX_API_KEY
# NS_HOSTNAME
# NS_KEYNAME
# NS_KEY
# NS_CP_CODE
# NS_BASE_PATH
CMD ["sh", "-c", "python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-4000}"]
