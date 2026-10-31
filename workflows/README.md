# Workflows

The seven n8n workflows behind Nour, exported from n8n and cleaned for publishing
(no credentials, ids or webhook ids; demo company wording).

| File | Role |
|---|---|
| `Chat_Bot.json` | Main flow: Telegram in/out, dedup, history, employee link, routing, reply, logging |
| `Router.json` | Picks the route for each message (fixed reply in code, Gemini, fallback model) |
| `Policy_RAG.json` | Policy answers with sources (Qdrant search + Gemini) |
| `HR_Data_Agent.json` | AI agent with database tools: read the employee's records, submit / cancel requests |
| `FAQ.json` | Procedures and tools questions |
| `General.json` | Work advice and casual talk |
| `Onboarding.json` | Links a Telegram user to an employee account |

Diagrams of each workflow: [`docs/workflows/`](../docs/workflows/).

## Importing

After importing into your own n8n:

1. Attach your credentials: Telegram, PostgreSQL, Qdrant, Ollama, Google Gemini (PaLM) API.
2. Open `Chat Bot` and point each **Call …** node to the matching sub-workflow you imported
   (the saved ids belong to the original n8n instance).

The workflows expect the PostgreSQL schemas `hr` and `support_dev` and the Qdrant collections
`nexora_policies_bge_m3` and `hr_faq_bge_m3`; these are not part of this repo.

## Updating the export

```bash
N8N_URL=https://<your-n8n> N8N_API_KEY=<key> ./scripts/export_workflows.sh <workflowId> [...]
node scripts/render_workflows.mjs   # redraw docs/workflows/*.svg
```

`export_workflows.sh` removes private fields and runs `clean_workflow.mjs` on every export.
Run the grep check it prints (no keys, tokens or private IPs) before committing.
