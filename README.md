# Infra DevOps — API de Contratos

Infraestrutura, automação e entrega contínua para a API de Contratos (Node.js + TypeScript, PostgreSQL, Redis, métricas Prometheus).

## Visão geral

```
Dev ──push──▶ GitHub ──▶ GitHub Actions (segredos ∥ testes ∥ SAST ∥ IaC ▶ build ▶ Trivy ▶ Docker Hub ∥ DAST ∥ Terraform)
                                                   │
                         ┌─────────────────────────┴───────────────┐
                         ▼                                         ▼
              Docker Compose (local)                    Kubernetes (cluster)
   api ─ postgres ─ redis ─ prometheus ─ grafana     Ingress ▶ Service ▶ API (HPA 2–6)
                                                              ├─ StatefulSet Postgres (PVC)
                                                              └─ Redis
```

## Estrutura dos arquivos de infraestrutura

| Arquivo | Função |
|---|---|
| `Dockerfile` / `.dockerignore` | Imagem multi-stage, enxuta, usuário não-root, HEALTHCHECK |
| `docker-compose.yml` | Ambiente completo local com healthchecks e monitoramento |
| `.env.example` | Modelo de variáveis (o `.env` real não é versionado) |
| `.github/workflows/ci-cd.yml` | Pipeline DevSecOps: segredos, testes, SAST, IaC, imagem, DAST e Terraform |
| `terraform/` | Infraestrutura como código (9 recursos) para o LocalStack |
| `k8s/*.yaml` | Manifestos: namespace, config, banco, cache, API, HPA, ingress |
| `monitoring/` | Prometheus e Grafana provisionados como código |
| `Makefile` | Atalhos de operação |

## Pré-requisitos

Docker + Docker Compose v2, Git e Terraform. Opcional: `kubectl` + minikube/kind (parte extra de Kubernetes).

## Execução local (Docker Compose)

```bash
git clone <url-do-repositorio> && cd infra-devops-contratos
cp .env.example .env        # edite as senhas
docker compose up -d --build   # ou: make up
docker compose ps              # todos devem estar "healthy"/"running"
```

Serviços: API `http://localhost:3000` · Prometheus `http://localhost:9090` · Grafana `http://localhost:3001` (usuário `admin`, senha `GRAFANA_PASSWORD`).

## Testando a API

Rotas existentes: `POST /contracts`, `GET /metrics` e `GET /health`. Campos do contrato: `title` e `userId` são obrigatórios; `description` e `value` são opcionais.

```bash
# 1) saúde e métricas
curl -i http://localhost:3000/health
curl -s http://localhost:3000/metrics | head

# 2) criar um contrato (esperado: HTTP 201 e "Contract created successfully")
curl -i -X POST http://localhost:3000/contracts \
  -H "Content-Type: application/json" \
  -d '{"title":"Contrato de prestação de serviços","userId":"user-1","description":"Contrato de teste","value":1500.50}'

# 3) validação (esperado: HTTP 400, faltou o userId)
curl -i -X POST http://localhost:3000/contracts \
  -H "Content-Type: application/json" \
  -d '{"title":"Contrato sem usuário"}'

# 4) conferir no banco
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT * FROM contracts;"'
```

Testes unitários: `npm ci && npm test`.

> As tabelas são criadas automaticamente (`synchronize: true` no TypeORM). Em produção real o ideal é usar migrations.

## Infraestrutura como código (Terraform + LocalStack)

O diretório `terraform/` descreve, em código, 9 recursos de uma AWS simulada pelo LocalStack (sem custo): VPC, sub-rede, internet gateway, tabela de rotas, associação de rota, security group (firewall), instância EC2, bucket S3 e versionamento do bucket. A EC2 é simulada; os containers da aplicação rodam via Docker Compose.

```bash
# requer Terraform instalado
docker compose --profile iac up -d localstack
curl -s http://localhost:4566/_localstack/health   # serviços "available"
cd terraform
terraform init
terraform apply -auto-approve                      # 9 recursos criados
terraform output
```

Atalhos: `make tf-up` e `make tf-down` (remove tudo com `terraform destroy`). O estado local (`.tfstate`) não vai para o Git.

## Extra (opcional): Kubernetes (minikube/kind)

Não faz parte da pipeline; mostra como a mesma imagem rodaria em um cluster.


```bash
minikube start && minikube addons enable ingress && minikube addons enable metrics-server
# ajuste a imagem em k8s/api.yaml (<usuario-dockerhub>/<repo>)
export DB_PASSWORD='senha-forte'
make k8s-up
kubectl -n contratos get pods
echo "$(minikube ip) contratos.local" | sudo tee -a /etc/hosts
curl http://contratos.local/health
```

Remover tudo: `make k8s-down`.

## Pipeline CI/CD (DevSecOps)

A cada push na `main` (e em pull requests), o GitHub Actions executa:

| Etapa | Ferramenta | O que faz |
|---|---|---|
| Segredos | Gitleaks | Procura credenciais vazadas no código e no histórico |
| Testes | Node.js + Jest | Compila (`tsc`) e roda os testes |
| SAST | Semgrep | Análise estática do código-fonte |
| Scan de IaC | Checkov | Verifica Dockerfile, Terraform e manifestos |
| Imagem | Docker + Trivy | Build, scan de vulnerabilidades e push no Docker Hub (tags SHA e `latest`) |
| DAST | OWASP ZAP | Ataque simulado contra a API em execução |
| Infraestrutura | Terraform + LocalStack | Cria 9 recursos numa AWS simulada |

**Secrets do GitHub** (*Settings → Secrets and variables → Actions*): `DOCKERHUB_USERNAME` e `DOCKERHUB_TOKEN` (token de acesso criado no Docker Hub). Sem eles, a imagem é construída e analisada, mas não publicada, e a pipeline continua verde.

Gitleaks, testes e Terraform bloqueiam a pipeline se falharem. SAST, Checkov, Trivy e DAST funcionam em modo relatório: mostram os achados sem bloquear.

## Justificativa de arquitetura

**Containerização (reprodutibilidade).** O mesmo artefato roda em dev, CI e produção, eliminando "funciona na minha máquina". O build multi-stage deixa a imagem final só com o necessário, reduzindo tamanho e superfície de ataque.

**Infraestrutura como código.** Compose, manifestos Kubernetes, Prometheus e Grafana são arquivos versionados. Qualquer pessoa recria o ambiente do zero com poucos comandos, e mudanças passam por revisão no Git.

**Integração e entrega contínuas.** Cada commit é compilado, testado e empacotado automaticamente; só código que passa nos testes gera imagem. Tags por SHA dão rastreabilidade e permitem rollback (`kubectl rollout undo`).

**Escalabilidade.** A API é stateless (estado fica em PostgreSQL e Redis), então escala horizontalmente. O HPA ajusta de 2 a 6 réplicas por uso de CPU; o Redis absorve leituras repetidas.

**Confiabilidade.** Healthchecks e `depends_on` garantem ordem de subida; readiness/liveness probes retiram pods doentes do tráfego e os reiniciam; rolling update com `maxUnavailable: 0` evita downtime; PVC mantém os dados do banco; `restart: unless-stopped` recupera falhas no Compose.

**Segurança.** Contêiner não-root, sem escalada de privilégios, limites de CPU/memória; credenciais fora do código (`.env` ignorado, Kubernetes Secrets, GitHub Secrets); banco e Redis expostos apenas na rede interna; scan de vulnerabilidades no pipeline.

**Observabilidade.** O `/metrics` da API alimenta o Prometheus e o Grafana (provisionados como código), permitindo acompanhar latência, taxa de requisições e erros.

**Infraestrutura como código (Terraform).** A infraestrutura de nuvem também é código: o mesmo `terraform apply` gera sempre o mesmo ambiente, e cada mudança fica registrada e revisável no Git. O LocalStack permite validar tudo sem custo.

**Segurança integrada ao pipeline (DevSecOps).** A segurança é verificada a cada push, antes de o código ir para o ar: Gitleaks (segredos), Semgrep (SAST), Checkov (IaC), Trivy (imagem) e OWASP ZAP (DAST, com a API rodando). Problemas aparecem cedo, quando custam pouco para corrigir.

**Entrega por imagem versionada.** A imagem é publicada no Docker Hub com a tag `latest` e o SHA do commit, o que mostra exatamente qual alteração gerou cada versão e permite voltar a uma versão anterior.

## Limitações e melhorias futuras

Postgres em instância única (produção: serviço gerenciado ou operador com réplicas); Terraform para provisionar cluster/cloud; ambientes de staging/prod separados; alertas (Alertmanager); Sealed Secrets/External Secrets.
