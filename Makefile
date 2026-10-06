.PHONY: up down logs test k8s-up k8s-down
up:       ; cp -n .env.example .env || true; docker compose up -d --build
down:     ; docker compose down
logs:     ; docker compose logs -f api
test:     ; npm ci && npm test
k8s-up:
	kubectl apply -f k8s/namespace.yaml
	kubectl -n contratos get secret contratos-secret >/dev/null 2>&1 || \
	  kubectl -n contratos create secret generic contratos-secret --from-literal=DB_USER=contracts --from-literal=DB_PASSWORD=$${DB_PASSWORD:?defina DB_PASSWORD}
	kubectl apply -f k8s/configmap.yaml -f k8s/postgres.yaml -f k8s/redis.yaml -f k8s/api.yaml -f k8s/hpa.yaml -f k8s/ingress.yaml
k8s-down: ; kubectl delete namespace contratos
