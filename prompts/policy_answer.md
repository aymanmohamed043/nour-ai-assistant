# Policy answer prompt (v2.2) — output JSON: question, employee_facts, rules[], answer
Sections: `<role>`, `<how_to_read_the_context>`, `<grounding_rules>` (7), `<answer_rules>`, `<style>`, `<output_format>`.

Grounding: every fact from a retrieved `<item>`; ids never typed in the text; no condition moved between clauses; no number/penalty that is not in a clause; ranges applied exactly; say clearly when a condition is not met yet.
Style: warm, confident, polite Egyptian Arabic; «حضرتك»; third persons in the third person; ≤ 1 emoji; HR suggestion only when information is missing, own data is needed, or clauses disagree.

User message = employee's earlier messages + `<retrieved_context>` (5 chunks) + `<employee_question>` + `<answer_language>` (set in code).
Full prompt: `Build Answer Request` node in `workflows/`.
