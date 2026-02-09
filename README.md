# Reasonly Studio

## 🏆 Gemini 3 Hackathon Submission

> **Gemini 3 Developer Challenge — Hackathon Edition**
>
> This repository represents a **Hackathon Edition** of Reasonly Studio, created for the [Gemini 3 Developer Challenge](https://gemini3.devpost.com/) (February 2026).
>
> **Key Points for Judges:**
> - The public demo uses **simulated sample data** and does not require real account connections
> - Real integrations are **optional** and use official platform APIs with read-only OAuth
> - **Gemini 3 Flash** is the core reasoning engine for all insight generation and recommendations
> - No endorsement by third-party platforms is implied

---

## 📋 Judge / Reviewer Instructions

1. **Public Demo (No Login Required):** Visit [https://reasonly-studio-prod-ac4360293096.herokuapp.com/demo.html](https://reasonly-studio-prod-ac4360293096.herokuapp.com/demo.html)
2. **Click any platform card** (Meta, Google, TikTok, LinkedIn) to simulate a connection
3. **Type a question** like "How are my campaigns performing?" and click "Ask Gemini 3"
4. **Observe the AI analysis** — Gemini 3 reasons over the data and returns insights
5. **Click "Analyze with AI"** on any widget to see Gemini 3's reasoning on specific metrics
6. All data shown is simulated demo data — no real accounts needed

---

## 🚀 What Was Built During the Hackathon

The following features were **implemented or significantly extended** during the Gemini 3 Developer Challenge contest period:

### Core Gemini 3 Features
- **Autonomous Marketing Analyst Agent** (`src/agents/marketingAnalyst.agent.js`) — A multi-step reasoning agent that plans investigations, calls tools, gathers evidence, and synthesizes findings using Gemini 3 Flash
- **Gemini-Powered Analysis Pipeline** (`src/ai/geminiClient.js`) — Direct integration with Gemini 3 Flash API for reasoning and insight generation
- **Widget-Level AI Analyzer** — Click "Analyze with AI" on any dashboard widget to get Gemini 3's interpretation of that specific metric
- **Natural Language Query Interface** — Ask questions in plain English; Gemini 3 interprets intent and orchestrates the analysis

### Demo Infrastructure
- **Demo Mode Dataset Handler** (`src/routes/demoRoutes.js`) — Provides simulated marketing data for hackathon judging without requiring real account connections
- **Hackathon-Specific UX Framing** — All pages display "Hackathon Edition" badges and explain demo mode clearly

### Analytics Tools (Gemini 3 Orchestrated)
- **KPI Aggregation Tool** — Computes spend, revenue, ROAS, CTR, CPA from data
- **Period Comparison Tool** — Compares current vs. previous periods for trend detection
- **Anomaly Detection Tool** — Identifies unusual patterns in metrics
- **Time Series Builder** — Generates data for trend visualizations

---

## 🤖 Gemini 3 Integration

Gemini 3 Flash is the **central reasoning engine** for this application. Here's exactly how it's used:

### Modules That Call Gemini 3 API

| Module | File | Purpose |
|--------|------|---------|
| Gemini Client | `src/ai/geminiClient.js` | Direct API calls to Gemini 3 Flash for text generation |
| Marketing Analyst Agent | `src/agents/marketingAnalyst.agent.js` | Multi-turn reasoning with tool orchestration |
| Dashboard Generator | `src/ai/dashboardGenerator.js` | Converts natural language to dashboard specs |
| Demo Analysis | `src/routes/demoRoutes.js` | Powers the "/api/demo/analyze" endpoint |

### What Gemini 3 Is Responsible For

1. **Reasoning & Causality** — When users ask "Why did my ROAS drop?", Gemini 3 reasons through the data to identify potential causes
2. **Insight Generation** — Gemini 3 synthesizes raw metrics into actionable executive summaries
3. **Recommendation Prioritization** — Gemini 3 ranks suggested actions by potential impact
4. **Natural Language Understanding** — Gemini 3 interprets user questions and determines which tools/data to use
5. **Evidence Synthesis** — Gemini 3 combines outputs from multiple analytics tools into coherent findings

### Gemini 3 Output is Central to the Demo

Every AI-powered analysis in the demo flows through Gemini 3:
- The "Ask Gemini 3" button sends queries to the Gemini 3 API
- Widget-level analysis uses Gemini 3 to interpret specific metrics
- Dashboard generation uses Gemini 3 to convert prompts to widget configurations

---

## 🔌 Third-Party Integrations

### Disclosure

- All platform integrations (Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads, Search Console) use **official APIs** via **read-only OAuth**
- Integrations are **optional** — the demo works fully without connecting real accounts
- The demo uses **simulated data** that does not require any platform connection
- **No endorsement** by Meta, Google, TikTok, LinkedIn, or any other platform is implied
- Platform names are trademarks of their respective owners

### How Integrations Work (When Used)

1. User clicks "Connect" on a platform card
2. OAuth flow redirects to the platform's authorization page
3. User grants read-only permission
4. Reasonly receives an access token (never the user's password)
5. Reasonly fetches campaign metrics via official API endpoints

---

## 📁 Project Structure

```
reasonly_studio/
├── public/                    # Frontend (HTML, CSS, JS)
│   ├── demo.html             # Main hackathon demo page
│   ├── dashboard.html        # Full dashboard experience
│   └── index.html            # Landing page
├── src/
│   ├── ai/                   # Gemini 3 integration
│   │   ├── geminiClient.js   # Gemini API wrapper
│   │   └── dashboardGenerator.js
│   ├── agents/               # AI agents
│   │   └── marketingAnalyst.agent.js  # Gemini-powered analyst
│   ├── tools/                # Analytics tools (Gemini-orchestrated)
│   │   └── analyticsTools.js
│   ├── routes/               # API routes
│   │   └── demoRoutes.js     # Demo-specific endpoints
│   └── config/               # Configuration
├── data/
│   └── sample.csv            # Simulated demo data
└── README.md
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Required for Gemini 3
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3-flash-preview
USE_GEMINI=true

# Server
PORT=3000
NODE_ENV=development

# JWT (use strong secret in production)
JWT_SECRET=YOUR_STRONG_SECRET_HERE
JWT_EXPIRE=7d

# Admin (change in production!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YOUR_SECURE_PASSWORD_HERE
```

### Running Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or start production server
npm start
```

Visit `http://localhost:3000/demo.html` to see the demo.

---

## 🔧 API Endpoints

### Demo Endpoints (No Auth Required)

| Endpoint | Description |
|----------|-------------|
| `POST /api/demo/analyze` | Gemini 3 analyzes a question against demo data |
| `POST /api/demo/dashboard` | Gemini 3 generates a dashboard from a prompt |
| `GET /api/demo/widgets` | Returns available widget types |

### Example: Gemini 3 Analysis

```bash
curl -X POST http://localhost:3000/api/demo/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How are my campaigns performing?",
    "platform": "meta"
  }'
```

Response includes Gemini 3's reasoning:
```json
{
  "ai_powered": true,
  "ai_provider": "gemini-3",
  "exec_summary": {
    "headline": "Your campaigns show strong ROAS of 3.2x...",
    "what_changed": ["..."],
    "why": ["..."],
    "what_to_do_next": ["..."]
  }
}
```

---

## 📜 License & Ownership

- **Ownership:** This submission is wholly owned by the submitter
- **Code:** All application code is original work created for this hackathon
- **Dependencies:** Third-party packages are used under their respective open-source licenses (MIT, ISC, Apache 2.0, etc.)
- **Assets:** UI icons and fonts are permissively licensed (Inter font: OFL, icons: MIT)
- **No Proprietary Code:** No proprietary third-party code is redistributed

**License:** ISC

---

## 🛡️ Security Notes

For production deployment:

1. Generate a strong `JWT_SECRET` (32+ random characters)
2. Change default admin credentials
3. Set `NODE_ENV=production`
4. Use HTTPS
5. Configure `CORS_ORIGIN` to your domain

---

## 📞 Support

For hackathon-related questions, please refer to the [Gemini 3 Developer Challenge](https://gemini3.devpost.com/) page.
