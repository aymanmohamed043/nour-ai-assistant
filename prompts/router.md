# Router prompt — the model answers `{"route": "policy" | "hr_data" | "faq" | "work_advice" | "unclear"}`
Greetings / thanks / ok / goodbye (≤ 6 words) and emoji-only messages are decided in code before this prompt.

Sections: `<role>` (choose where the CURRENT message goes, never answer it) · `<routes>` (policy / hr_data / faq / work_advice / unclear, each with a definition and Arabic + English examples) · `<rules>` (1. understandable alone → route it alone; 2. short follow-up → route of the LAST exchange; 3. confirmation, refusal or missing detail for a pending request → hr_data; 4. own data or an action → hr_data, what the rules allow → policy, how / where to do it → faq; 5. greeting + question → route by the question) · `<output>` (JSON only).

User message = last 3 exchanges (clause numbers and sources removed, the last one marked) + CURRENT message.
Full prompt: `Build Router Request` node in `workflows/Router.json`.
