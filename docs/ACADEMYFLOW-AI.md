# AcademyFlow AI

AcademyFlow AI is the built-in learning assistant for student and instructor portals.

## Current strategy: free first

The default provider is Google Gemini using `gemini-3.5-flash-lite`.

This keeps the first stage on Gemini's Free Tier. When the platform grows, change
`ACADEMYFLOW_AI_MODEL` to a stronger paid Gemini model, or switch
`ACADEMYFLOW_AI_PROVIDER` later without rewriting the AcademyFlow UI or routes.

## First phase

- Grounded chat over courses and lesson descriptions the signed-in user can access.
- Course summarization.
- Instructor quiz generation that creates a real draft quiz in AcademyFlow.
- Tenant isolation and role-aware course scoping.
- Dedicated AI rate limit.
- No API key is exposed to browser JavaScript.
- Student names, emails, attendance, grades and passwords are not sent in the current AI context.

## Railway environment variables

```env
ACADEMYFLOW_AI_ENABLED=true
ACADEMYFLOW_AI_PROVIDER=gemini
GEMINI_API_KEY=
ACADEMYFLOW_AI_MODEL=gemini-3.5-flash-lite
ACADEMYFLOW_AI_RATE_LIMIT=30
ACADEMYFLOW_AI_TIMEOUT_MS=30000
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

`GEMINI_API_KEY` must only be stored on the server. Never place it in browser
JavaScript, HTML, screenshots, documentation, or GitHub commits.

## Privacy note for the free tier

The Free Tier provider may use submitted API content to improve its products.
For that reason, the current AcademyFlow AI context is intentionally restricted
to course and lesson content. Do not add student PII, grades, attendance records,
private academy records, or other sensitive data to the prompt context while
using the free tier.

If AI is later used for sensitive student analytics, move that feature to a paid
API tier with appropriate privacy terms before enabling it.

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

The AI widget is injected by the server into `/student/*.html` and
`/instructor/*.html`, so existing self-contained portal pages do not need to be
edited individually.
