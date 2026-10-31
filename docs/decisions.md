# Engineering decisions

Short records of the decisions that shaped Nour: the problem, the options, what was measured and what was chosen.
The tests behind these numbers are in [`docs/evaluation.md`](evaluation.md).

---

## 1. Follow-up questions: no LLM query rewrite

**Problem.** Employees ask short follow-ups: «إجازة الجواز كام يوم؟» then «طب ولو لسه مكملتش 6 شهور؟».
The second message alone does not mention marriage leave, so a vector search on it finds the wrong clauses.

**Options.**

| | How it works | Cost |
|---|---|---|
| A. LLM query rewrite | A model rewrites the follow-up into a standalone question, then search | One extra model call before every search |
| B. Second search built in code | Search the original message **and** a second text: previous question + start of the previous answer + current message | One extra vector search, no model call |

**What we measured (free tier).**

- A: the rewrite call was **late 5 times out of 6**, so it ate most of the time budget of the answer.
- B: the second search found the right clauses **5 out of 5** times.

**Decision: B.** It is faster, needs no extra model call, and it can never change what the employee asked:
the answer model always receives the employee's **original words**, the extra search only finds more context.

**How it is built** ([`workflows/Policy_RAG.json`](../workflows/Policy_RAG.json)):

1. `Pick Query`: the search text is the original message, plus policy words for known dialect terms
   (for example «اتجوز / جواز» adds «إجازة الزواج»). The dictionary only **adds** words.
   With history, it also builds the follow-up text: previous question + first 300 characters of the previous answer + current message.
2. `Build Search Queries`: one search for the original message, a second one for the follow-up text when there is history.
3. `Build Answer Request`: merges both result lists by clause. The **best 3 chunks of the original search are always kept**,
   then the best of the rest fill up to **5 chunks**. So the follow-up search can only add context, never push out what the original question found.

---

## 2. Router: one model call with the last 3 exchanges

**Problem.** Every message must go to the right part of the system (policy, own data, FAQ, advice) before anything else happens.
Short replies like «تمام» or «أيوه أكد» are the hardest: alone they look like small talk, but often they confirm a request Nour just prepared.

**Before.** Two passes: first the message alone, then a second call with the conversation only if the first said "unclear".
That meant two model calls for exactly the messages that need speed (confirmations).

**Decision.** One call that sees the current message and the last 3 exchanges, with explicit rules:
short follow-ups take the route of the last exchange; a confirmation or a missing detail for a pending request goes to the HR data agent.
Pure greetings and thanks are answered in code, with no model call.
Gemini 3.5 Flash-Lite is the main model, Gemini 3.1 Flash-Lite the fallback.

**Evidence** ([router test](evaluation.md#1-router-42-conversation-cases)): 42 cases covering follow-ups, topic changes,
English and prompt injection: **40/42 correct**, no wrong route, and 2 got no decision because of network errors on the server.
That run used the earlier 3-route version (policy / general / unclear); the 5-route version has not been re-run on this set.

---

## 3. Policy answer model chosen by tests

**Problem.** A wrong number in an HR answer (days of leave, a deduction) is worse than no answer.

**What we compared.** The same search, the same 5 chunks and the same prompt, only the model changes.

| Test | Result |
|---|---|
| 30 policy questions: Gemini 3.5 Flash-Lite (free) vs Qwen3.7 Flash (paid) | Gemini 28 correct, 2 partial, **0 wrong**. Qwen 21 correct, 7 partial, **2 wrong** |
| 30 policy questions: local Qwen3.6-35B-A3B (vLLM) | 23 correct, 4 partial, **3 wrong**, median 7.6 s vs 1.8 s for Gemini |
| 8 hard questions, 8 free Gemini / Gemma models | gemini-3.1-flash-lite **8/8**, the only one with every answer correct |

**Decision.** gemini-3.1-flash-lite answers policy questions, gemini-3.5-flash-lite is its fallback.
The paid model is **not** used as a fallback: a wrong HR number is worse than a polite apology.

---

## 4. Facts and sources are controlled by code, not by the prompt

- **One chunk per policy clause**, with the clause ids in the metadata. The model returns JSON with the clause ids it used,
  and the `📌 المصادر` line is added by code from those ids, so a source can never be made up.
- **Reply language** is decided in code from the employee's message, not left to the model.
- **Forbidden phrases** (for example «يا فندم», «سيادتك») are removed in code for every route in one place; prompts alone were not reliable.
- **Write actions** (submit / cancel a request) need an explicit confirmation, and they go through database functions only.
