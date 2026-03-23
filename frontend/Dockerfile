# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

WORKDIR /usr/src/app

# Install dependencies separately to leverage Docker layer caching
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

ARG APP_TARGET=agent
ENV FRONTEND_APP=$APP_TARGET

EXPOSE 3005 3006

# Run the appropriate Vite dev server so the UI is reachable from outside the container
CMD ["sh", "-c", "npm run dev:${FRONTEND_APP}"]
