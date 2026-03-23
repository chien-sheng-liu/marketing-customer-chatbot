COMPOSE ?= docker compose
BACKEND_ENV_FILE ?= backend/.env.local
BACKEND_PORT ?= 4000
CUSTOMER_PORT ?= 3005
AGENT_PORT ?= 3006
ENV_VARS = BACKEND_ENV_FILE=$(BACKEND_ENV_FILE) BACKEND_PORT=$(BACKEND_PORT) CUSTOMER_PORT=$(CUSTOMER_PORT) AGENT_PORT=$(AGENT_PORT)

.PHONY: up down logs build check-env

check-env:
	@if [ ! -f "$(BACKEND_ENV_FILE)" ]; then \
		echo "Missing backend env file $(BACKEND_ENV_FILE). Copy backend/.env.local.example and set CHATGPT_API_KEY."; \
		exit 1; \
	fi

build: check-env
	$(ENV_VARS) $(COMPOSE) build

up: check-env
	$(ENV_VARS) $(COMPOSE) up --build -d

down:
	$(ENV_VARS) $(COMPOSE) down

logs:
	$(ENV_VARS) $(COMPOSE) logs -f
