# AcademyFlow AI

AcademyFlow AI is the built-in learning assistant for student and instructor portals.

## First phase

- Grounded chat over courses and lesson descriptions the signed-in user can access.
- Course summarization.
- Instructor quiz generation that creates a real draft quiz in AcademyFlow.
- Tenant isolation and role-aware course scoping.
- Dedicated AI rate limit.
- OpenAI Responses API calls use `store: false`.

## Railway environment variables

```env
ACADEMYFLOW_AI_ENABLED=true
OPENAI_API_KEY=
ACADEMYFLOW_AI_MODEL=gpt-6-luna
ACADEMYFLOW_AI_RATE_LIMIT=30
ACADEMYFLOW_AI_TIMEOUT_MS=30000
# Optional OpenAI-compatible base URL. Leave blank for OpenAI.
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_API_KEY` must only be stored on the server. Never place it in browser JavaScript or HTML.

## Access rules

- Students: only enrolled courses with active/paused/completed enrollment and published lessons.
- Instructors: only courses returned by the existing instructor scope service.
- AI routes always run through auth + tenant middleware.
- Generated quizzes require the instructor to be the directly assigned course instructor.

## Routes

- `GET /api/ai/context`
- `POST /api/ai/chat`
- `POST /api/ai/summarize`
- `POST /api/ai/quiz-draft` (instructor only)

The AI widget is injected by the server into `/student/*.html` and `/instructor/*.html`, so existing self-contained portal pages do not need to be edited individually.
