# mapcidade-lockdown-audit

> Anonymized, from-scratch reconstruction of a real internal tool's architecture, built for a portfolio. Fictional data only ("MapCidade" / Rivermeadow) — no real company, city, or infrastructure is represented here.

## English

### Problem

A GIS platform running dozens of separate municipal databases accumulates configuration drift: a WMS layer with the wrong tiling flags, a theme with a max zoom set too low for its layer density, a spatial table missing its GIST index, a config row pointing at a URL that shouldn't be reachable from outside. None of this is a crash by itself — but left unchecked across enough databases, it's exactly the kind of drift that causes an environment to slow down or lock up under load. Checking it by hand means running and comparing dozens of queries, database by database — repetitive, and easy to do incompletely.

### Solution

A fixed playbook of 10 rules (R1–R10) runs a single automated pass: layer tiling flags, missing priority values, suspicious external URLs, zoom thresholds by theme type, missing spatial indexes, a checklist of expected supporting indexes, and invalid geometries in the main cadastral layers. Every rule only ever runs a `SELECT`. When a rule fails, the corrective SQL is printed as **text** for a human to review — it is never executed by the tool itself.

### Stack

TypeScript, Node.js (`node:util.parseArgs`, no CLI framework), `chalk`, `cli-table3`, `vitest`. The demo runs against a seeded in-memory fixture — no database, network, or external service required.

### How to run

```bash
npm install
npm run demo                              # seeded Rivermeadow fixture, mixed OK/FAIL results
npm run dev -- --city rivermeadow --verbose
npm run dev -- --city rivermeadow --md    # writes audit_rivermeadow.md
```

### Demo

Terminal walkthrough — see `npm run demo` above; a recorded GIF will be linked here.

### What I learned / engineering decisions

The real tool talks to 90+ live Postgres/PostGIS databases through a private MCP gateway — infrastructure that obviously can't ship in a public portfolio repo. Rather than force a fake database engine to run genuine Postgres-catalog SQL (`pg_indexes`, `pg_attribute`, `ST_IsValid`) that most embeddable engines don't support, I kept the `Db` interface the original codebase already had — it was designed to be injectable specifically so the rule logic could be unit-tested without a live connection — and reused that same seam as the demo's backend: a seeded fixture instead of a scripted test double. Same interface, same rule engine, zero new abstraction. Production would add a five-line adapter over a real Postgres driver; nothing else in the tool would need to change.

Table and column names throughout (`layer_source`, `theme`, `layer_attribute_dictionary`, ...) are invented generic names, not the platform's real internal schema — renaming those was part of the anonymization pass, not a design decision.

Also carried over preventively from a sibling project in this same portfolio: the CLI-entrypoint guard uses `pathToFileURL()` instead of a raw string comparison against `process.argv[1]`, because the naive comparison silently never matches on Windows.

## Português

### Problema

Uma plataforma GIS rodando dezenas de bancos municipais separados acumula desvio de configuração ao longo do tempo: uma camada WMS com as flags de tiling erradas, um tema com zoom máximo baixo demais pra densidade da camada, uma tabela espacial sem índice GIST, uma linha de config apontando pra uma URL que não deveria ser acessível de fora. Nada disso é uma queda por si só — mas, sem checagem, é exatamente o tipo de desvio que deixa um ambiente lento ou sujeito a travar sob carga. Conferir manualmente significa rodar e comparar dezenas de queries, banco a banco — repetitivo e fácil de fazer incompleto.

### Solução

Um conjunto fixo de 10 regras (R1–R10) roda uma checagem automatizada única: flags de tiling das camadas, valores de prioridade ausentes, URLs externas suspeitas, limites de zoom por tipo de tema, índices espaciais ausentes, uma checklist de índices de apoio esperados e geometrias inválidas nas camadas cadastrais principais. Toda regra só faz `SELECT`. Quando uma regra falha, o SQL corretivo é impresso como **texto** para revisão humana — nunca é executado pela própria ferramenta.

### Stack

TypeScript, Node.js (`node:util.parseArgs`, sem framework de CLI), `chalk`, `cli-table3`, `vitest`. O demo roda contra uma fixture em memória — sem banco, rede ou serviço externo.

### Como rodar

```bash
npm install
npm run demo                              # fixture fictícia Rivermeadow, resultados OK/FAIL misturados
npm run dev -- --city rivermeadow --verbose
npm run dev -- --city rivermeadow --md    # grava audit_rivermeadow.md
```

### O que aprendi / decisões de engenharia

A ferramenta real fala com 90+ bancos Postgres/PostGIS ao vivo por um gateway MCP privado — infra que obviamente não pode ir num repo público de portfolio. Em vez de forçar um motor de banco fake a rodar SQL genuíno de catálogo Postgres (`pg_indexes`, `pg_attribute`, `ST_IsValid`) que a maioria dos motores embutíveis não suporta, mantive a interface `Db` que o código original já tinha — projetada justamente pra ser injetável, pra testar a lógica das regras sem conexão real — e reusei essa mesma costura como backend do demo: uma fixture semeada em vez de um duplo de teste roteirizado. Mesma interface, mesmo motor de regras, zero abstração nova. Produção acrescentaria um adaptador de cinco linhas sobre um driver Postgres real; nada mais na ferramenta precisaria mudar.

Nomes de tabela e coluna ao longo do código (`layer_source`, `theme`, `layer_attribute_dictionary`, ...) são nomes genéricos inventados, não o esquema interno real da plataforma — renomear isso fez parte do processo de anonimização, não foi decisão de design.

Também trazido preventivamente de um projeto irmão deste mesmo portfolio: o guard do entrypoint da CLI usa `pathToFileURL()` em vez de comparação de string crua contra `process.argv[1]`, porque a comparação ingênua nunca bate silenciosamente no Windows.
