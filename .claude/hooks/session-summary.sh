#!/usr/bin/env bash
# SessionEnd hook — génère docs/sessions/<date>.md via un LLM local (Ollama),
# pour éviter de dépenser des tokens Claude sur un résumé mécanique.
# Le format du payload (transcript_path en JSONL) a été confirmé via la doc
# officielle des hooks Claude Code, pas seulement observé — voir dump debug
# ci-dessous en filet de sécurité si le format change un jour.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
DEBUG_FILE="$HOOK_DIR/.session-end-debug.json"
ERROR_LOG="$HOOK_DIR/.session-end-error.log"
MODEL="qwen2.5:7b"
DOCS_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}/docs/sessions"
TEMPLATE="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." && pwd)}/docs/templates/session-template.md"

payload="$(cat)"
echo "$payload" > "$DEBUG_FILE"

log_error() {
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$ERROR_LOG"
}

command -v jq >/dev/null 2>&1 || { log_error "jq introuvable dans PATH, résumé sauté"; exit 0; }
command -v curl >/dev/null 2>&1 || { log_error "curl introuvable dans PATH, résumé sauté"; exit 0; }

OLLAMA_URL="http://localhost:11434/api/generate"
curl -s -m 5 "http://localhost:11434/api/tags" >/dev/null 2>&1 || { log_error "serveur Ollama injoignable sur localhost:11434, résumé sauté"; exit 0; }

transcript_path="$(jq -r '.transcript_path // empty' <<<"$payload")"
reason="$(jq -r '.reason // "other"' <<<"$payload")"

[[ -n "$transcript_path" && -f "$transcript_path" ]] || { log_error "transcript_path absent ou introuvable ($transcript_path)"; exit 0; }

# Texte + réponses seulement (pas thinking/tool_use/tool_result) pour rester
# dans la fenêtre de contexte d'un modèle 7B ; on garde la fin de session
# (plus pertinente pour "Fait"/"Prochaine étape") si le transcript est long.
conversation="$(jq -r '
	select(.type=="user" or .type=="assistant") as $m |
	($m.message.content) as $c |
	if ($c|type)=="string" then
		"\($m.type|ascii_upcase): \($c)"
	else
		($c[]? | select(.type=="text") | "\($m.type|ascii_upcase): \(.text)")
	end
' "$transcript_path" 2>/dev/null | tail -c 60000)"

[[ -n "$conversation" ]] || { log_error "transcript vide après extraction ($transcript_path, reason=$reason)"; exit 0; }

mkdir -p "$DOCS_DIR"
today="$(date +%Y-%m-%d)"
now="$(date +%H:%M)"
outfile="$DOCS_DIR/$today.md"

template_body="$(cat "$TEMPLATE" 2>/dev/null || printf '## Fait\n\n## Pièges pour le prochain agent/session\n\n## Prochaine étape suggérée\n')"

prompt="Tu es un assistant qui rédige des comptes-rendus de session de développement en français, de façon concise et factuelle.

Voici un extrait d'une conversation entre un utilisateur et un agent de code (Claude Code) sur un projet de jeu web. Résume cette session en remplissant EXACTEMENT cette structure markdown (garde les titres ##, ne rajoute aucune autre section) :

$template_body

Consignes :
- Section \"Fait\" : liste à puces des changements/décisions concrets de la session.
- Section \"Pièges pour le prochain agent/session\" : uniquement ce qui est non évident et pourrait piéger quelqu'un qui reprend le travail (ne rien inventer, laisser vide si rien de notable).
- Section \"Prochaine étape suggérée\" : 1-3 puces sur la suite logique évoquée dans la conversation.
- Réponds uniquement en markdown, sans préambule ni commentaire hors des sections.

Extrait de la conversation :
---
$conversation
---"

# API REST plutôt que le CLI `ollama run` : celui-ci émet des séquences ANSI
# de retour-chariot pour le word-wrap même hors tty, qui polluaient le texte
# capturé en sortie (observé lors du test manuel de ce script).
request_body="$(jq -n --arg model "$MODEL" --arg prompt "$prompt" '{model: $model, prompt: $prompt, stream: false}')"
response_json="$(curl -s -m 300 "$OLLAMA_URL" -d "$request_body" 2>>"$ERROR_LOG")"
summary="$(jq -r '.response // empty' <<<"$response_json" 2>>"$ERROR_LOG")"

if [[ -z "$summary" ]]; then
	log_error "réponse Ollama vide ou invalide (modèle=$MODEL, reason=$reason): $response_json"
	exit 0
fi

if [[ -f "$outfile" ]]; then
	{
		printf '\n---\n\n# Session %s (%s)\n\n' "$now" "$reason"
		printf '%s\n' "$summary"
	} >> "$outfile"
else
	{
		printf '# Session %s (%s)\n\n' "$now" "$reason"
		printf '%s\n' "$summary"
	} > "$outfile"
fi

exit 0
