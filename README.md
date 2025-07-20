
## CodeNexta 
   A Next.js-based online code editor SaaS platform for developers to collaborate and share their code snippets.

---
 ## Highlights:

  - 🚀 Tech stack: Next.js 15 + Convex + Clerk + TypeScript
  - 💻 Online IDE with multi-language support (10 languages)
  - 🎨 Customizable experience with 5 VSCode themes
  - ✨ Smart output handling with Success & Error states
  - 🤖 Smart error fixing using Gemini API. 
  - 💎 Flexible pricing with Free & Pro plans
  - 🤝 Community-driven code sharing system
  - 🔍 Advanced filtering & search capabilities
  - 👤 Personal profile with execution history tracking
  - 📊 Comprehensive statistics dashboard
  - ⚙️ Customizable font size controls
  - 🔗 Webhook integration support
  - 🌟 Professional deployment walkthrough


  ---
## Demo link:- https://codenexta.vercel.app/


## Gemini API Rate Limiting

The application implements daily rate limiting specifically for Gemini API usage to prevent abuse:

- **Daily Limit**: 10 Gemini API requests per user/IP address per day
- **Scope**: Applies only to AI-powered features (Coding Buddy and Error Fixing)
- **Reset**: Limits reset at midnight UTC each day
- **Headers**: Rate limit information is provided in response headers:
  - `X-RateLimit-Limit`: Maximum requests per day (10)
  - `X-RateLimit-Remaining`: Remaining requests for today
  - `X-RateLimit-Reset`: Timestamp when limit resets

### Gemini API Rate Limiting Endpoints

- `GET /gemini-rate-limit-status` - Check current Gemini API rate limit status
- Rate limiting is automatically applied to:
  - AI Coding Buddy conversations
  - AI-powered error fixing feature
  - **NOT applied to**: Code execution, webhooks, or other API endpoints

### Database Schema

Gemini API rate limiting data is stored in the `rateLimits` table:
- `identifier`: User ID or IP address
- `date`: Date in YYYY-MM-DD format
- `requestCount`: Number of Gemini API requests made today
- `lastRequestTime`: Timestamp of last request

---
