# Reasonly Studio Backend API & CMS

A Node.js backend API with a complete Admin Panel CMS for Reasonly Studio, built with Express.js.

## Features

- RESTful API architecture
- Express.js web framework
- **Full-featured Admin Panel CMS**
- **B2B User Registration System with Admin Approval**
- **User Management Dashboard**
- JWT-based authentication
- CRUD operations for ads management
- User approval workflow (pending, approved, rejected)
- Beautiful responsive UI
- CORS enabled
- Security headers with Helmet
- Request logging with Morgan
- Environment-based configuration
- Error handling middleware
- Health check endpoint

## Project Structure

```
ads-data/
├── public/              # Static files
│   ├── css/            # Stylesheets
│   │   └── style.css
│   ├── js/             # Client-side JavaScript
│   │   ├── admin.js
│   │   ├── login.js
│   │   └── register.js
│   ├── admin.html      # Admin dashboard (Ads & User Management)
│   ├── login.html      # Login page
│   └── register.html   # B2B registration page
├── src/
│   ├── config/         # Configuration files
│   ├── controllers/    # Request handlers
│   │   ├── adsController.js
│   │   ├── authController.js
│   │   └── userController.js
│   ├── middleware/     # Custom middleware (auth, error handling)
│   ├── models/         # Data models
│   │   ├── adsData.js
│   │   └── userData.js
│   ├── routes/         # API routes
│   │   ├── adminRoutes.js
│   │   ├── authRoutes.js
│   │   └── adsRoutes.js
│   ├── utils/          # Utility functions
│   ├── app.js          # Express app setup
│   └── server.js       # Server entry point
├── .env.example        # Example environment variables
├── .gitignore
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/sarvarjafarov/reasonly-studio.git
cd reasonly-studio
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=*

# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRE=7d

# Admin Credentials (change in production!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### Platform OAuth configuration

The Connect cards on the dashboard rely on OAuth flows. Populate the following variables before trying to link any ad account:

| Variable | Purpose |
| --- | --- |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | Meta Ads (Facebook/Instagram) OAuth credentials. See `META_OAUTH_SETUP.md` for the Meta-specific steps. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_DEVELOPER_TOKEN` | Google Ads OAuth configuration sourced from a Google Cloud OAuth client. Redirect URI must match `http://localhost:3000/api/oauth/google/callback` (or your production URL). |
| `SEARCH_CONSOLE_CLIENT_ID`, `SEARCH_CONSOLE_CLIENT_SECRET`, `SEARCH_CONSOLE_REDIRECT_URI` | Google Search Console OAuth (can share the same Google project as Google Ads). |
| `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_REDIRECT_URI` | TikTok Ads OAuth credentials from TikTok for Business. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | LinkedIn Campaign Manager OAuth credentials. |

After updating the credentials, restart the server (`npm run dev`) so the backend picks up the new values. When you visit `http://localhost:3000/dashboard`, select a workspace and click a Connect button. Successful OAuth flows redirect you back with `?oauth=success&platform=...`, while failures show a warning in the alert area.

For deployments, make sure the production callback URLs (`https://yourdomain.com/api/oauth/<platform>/callback`) are registered with each provider and that the same env vars are set through your hosting provider (Heroku `config:set`, Render secrets, etc.). `PROJECT_B_DEPLOYMENT_GUIDE.md` includes the exact Heroku commands used for each platform.

### Hackathon Analyst Mode (Backend)

The new `POST /api/ai/analyze` endpoint powers the Autonomous Marketing Analyst experience. It relies on deterministic tool outputs (KPIs, comparisons, time series, anomaly detection) derived from `data/sample.csv` and returns the strict `FinalResponse` JSON contract. To try it locally:

```bash
curl http://localhost:3000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "workspace-main",
    "question": "How did January spend perform?",
    "dateRange": { "start": "2026-01-15", "end": "2026-01-24" },
    "compareMode": "previous_period",
    "primaryKpi": "roas"
  }'
```

The tools under `src/tools/analyticsTools.js` read the sample CSV, aggregate KPIs, compare periods, build timeseries, and flag anomalies. The agent (`src/agents/marketingAnalyst.agent.js`) orchestrates the plan, evidence, findings, actions, dashboard spec, and executive summary. Later we will swap the deterministic logic with Gemini 3 (marked with TODOs). You can update `data/sample.csv` with richer data to prototype new behaviors before wiring a real warehouse.

#### Gemini configuration

Set `GEMINI_API_KEY`, `GEMINI_MODEL`, and `USE_GEMINI=true` via your environment (Heroku config vars) to run the Gemini-driven path. The agent enforces function-calling, tool-backed numbers, and the strict `FinalResponse` JSON contract. Monitor the server logs for the `Gemini plan` and `Gemini tool call` entries so you can trace the investigation steps and tool usage that produced the response.

#### How to test locally

```bash
USE_GEMINI=true GEMINI_API_KEY=your_key GEMINI_MODEL=gemini-3-flash npm start

curl http://localhost:3000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "workspace-main",
    "question": "How did the latest sprint perform?",
    "dateRange": { "start": "2026-01-15", "end": "2026-01-24" }
  }'
```

If `USE_GEMINI=false`, the endpoint falls back to deterministic reasoning; setting it to `true` triggers the Gemini tool-calling workflow.

### Email & Notification settings

Verification and admin notification emails default to the SMTP credentials in `.env` (or your staging deploy). Set the following values so `emailService` can send real mail instead of just logging the payload:

| Variable | Description |
| --- | --- |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASSWORD` | SMTP host/port/credentials. For Gmail you can use an App Password and `smtp.gmail.com` on port 587 (secure=false). |
| `EMAIL_FROM` | The friendly sender address shown in verification emails (e.g., `Reasonly Studio <noreply@reasonly.com>`). |
| `APP_URL` | The base URL your clients hit (`https://reasonly-studio-staging-...herokuapp.com`). Used to build the verification link and admin approval URL. |
| `ADMIN_EMAILS` | Comma-separated list of admin contacts who should receive new-user notifications after email verification. |

Once SMTP is configured and `NODE_ENV=production`, new signups will receive the verification link in Gmail (check Spam/Promotions if necessary) and the admin list will automatically be notified so you can approve the account. You can also resend verification via `/api/auth/resend-verification`.

### Running the Application

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000`

## Admin Panel (CMS)

### Accessing the Admin Panel

1. Open your browser and navigate to:
   ```
   http://localhost:3000/admin/login
   ```

2. Login with default credentials:
   - **Username:** admin
   - **Password:** admin123

3. After successful login, you'll be redirected to the admin dashboard where you can:
   - **Ads Management Tab:**
     - View all ads in a table format
     - Create new ads
     - Edit existing ads
     - Delete ads
     - Filter and manage ad status (active, inactive, draft)
   - **User Management Tab:**
     - View all registered B2B users
     - Approve pending user registrations
     - Reject user registrations
     - Filter users by status (all, pending, approved, rejected)
     - Delete users
     - Monitor user statistics

### Admin Panel Features

- **Authentication:** Secure JWT-based authentication
- **Dashboard:** Clean, modern interface with statistics and tabbed navigation
- **Ads Management:**
  - Complete CRUD operations
  - Image support for ads
  - Category organization (Electronics, Fashion, Home, etc.)
  - Status management (active, inactive, draft)
- **User Management:**
  - B2B user approval workflow
  - View pending registrations
  - Approve/reject users
  - User filtering by status
  - Delete user accounts
  - Protected admin account
- **Responsive Design:** Works on desktop, tablet, and mobile devices

## B2B User Registration

### For New Users

1. Navigate to the registration page:
   ```
   http://localhost:3000/register
   ```

2. Fill out the registration form with:
   - Username
   - Business Email
   - Password
   - Company Name
   - Contact Person (optional)
   - Phone Number (optional)

3. After submitting, your account will be created with **pending** status

4. Wait for admin approval before you can login

### User Registration Flow

1. **User Registers** → Status: `pending`
2. **Admin Reviews** → Admin can approve or reject
3. **User Approved** → Status: `approved` → User can now login
4. **User Rejected** → Status: `rejected` → User cannot login

### Login Restrictions

- Users with `pending` status will see: "Your account is pending approval"
- Users with `rejected` status will see: "Your account has been rejected"
- Only `approved` users can access the system

## API Endpoints

### Health Check
- `GET /api/health` - Check server health status

### Authentication
- `POST /api/auth/register` - Register new B2B user (creates user with pending status)
- `POST /api/auth/login` - Login and get JWT token (checks approval status)
- `POST /api/auth/logout` - Logout (requires authentication)
- `GET /api/auth/me` - Get current user info (requires authentication)

### Public Ads Endpoints
- `GET /api/ads` - Get all ads
- `GET /api/ads/:id` - Get ad by ID
- `POST /api/ads` - Create new ad
- `PUT /api/ads/:id` - Update ad by ID
- `DELETE /api/ads/:id` - Delete ad by ID

### Admin Endpoints (Require Authentication)

**Ads Management:**
- `GET /api/admin/ads` - Get all ads (admin)
- `GET /api/admin/ads/:id` - Get ad by ID (admin)
- `POST /api/admin/ads` - Create new ad (admin)
- `PUT /api/admin/ads/:id` - Update ad by ID (admin)
- `DELETE /api/admin/ads/:id` - Delete ad by ID (admin)

**User Management:**
- `GET /api/admin/users` - Get all users (admin)
- `GET /api/admin/users/pending` - Get pending users (admin)
- `GET /api/admin/users/:id` - Get user by ID (admin)
- `POST /api/admin/users/:id/approve` - Approve user (admin)
- `POST /api/admin/users/:id/reject` - Reject user (admin)
- `DELETE /api/admin/users/:id` - Delete user (admin)

## Example API Requests

### Get Health Status
```bash
curl http://localhost:3000/api/health
```

### Register New B2B User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@company.com",
    "password": "securepass123",
    "companyName": "Acme Corp",
    "contactPerson": "John Doe",
    "phone": "+1234567890"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### Approve User (Admin)
```bash
curl -X POST http://localhost:3000/api/admin/users/USER_ID/approve \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Pending Users (Admin)
```bash
curl http://localhost:3000/api/admin/users/pending \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Create Ad (Authenticated)
```bash
curl -X POST http://localhost:3000/api/admin/ads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Sample Ad",
    "description": "This is a sample ad",
    "price": 99.99,
    "category": "Electronics",
    "status": "active"
  }'
```

### Get All Ads
```bash
curl http://localhost:3000/api/ads
```

### Update Ad (Authenticated)
```bash
curl -X PUT http://localhost:3000/api/admin/ads/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"title": "Updated Ad", "price": 149.99}'
```

### Delete Ad (Authenticated)
```bash
curl -X DELETE http://localhost:3000/api/admin/ads/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Development

### Adding New Routes

1. Create a controller in `src/controllers/`
2. Create a route file in `src/routes/`
3. Register the route in `src/routes/index.js`

### Error Handling

All errors are handled by the error handling middleware in `src/middleware/errorHandler.js`. Errors will return JSON responses with appropriate status codes.

## Security Notes

⚠️ **IMPORTANT:** Before deploying to production:

1. Change the `JWT_SECRET` in `.env` to a strong, random string
2. Update admin credentials (`ADMIN_USERNAME` and `ADMIN_PASSWORD`)
3. Set `NODE_ENV=production`
4. Configure `CORS_ORIGIN` to your frontend domain
5. Use HTTPS in production
6. Consider adding rate limiting
7. Implement proper password hashing for multiple users

## Current Data Storage

The application currently uses **in-memory storage** for demonstration purposes. All data will be lost when the server restarts.

### Next Steps for Production

- Add database integration (MongoDB, PostgreSQL, MySQL, etc.)
- ✅ ~~Implement proper user management system~~ (Completed: B2B registration with approval workflow)
- Add file upload for images
- Add input validation and sanitization
- Add email notifications for user approval/rejection
- Write unit and integration tests
- Add API documentation (Swagger/OpenAPI)
- Implement rate limiting
- Add caching layer
- Set up logging and monitoring
- Add password reset functionality
- Implement two-factor authentication (2FA)

## License

ISC
