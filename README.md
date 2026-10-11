# NAWI Pro Backend

**Backend API for NAWI Pro, a Smart India Hackathon solution for recording OIML R 76 test observations and generating test reports for non-automatic weighing instruments (NAWIs).**

The service provides the application API used by the NAWI Pro web client. It manages identity and access, laboratories, instrument workflows, test records, evidence, review, reports, certificates, notifications, and audit history. Inspection workflows are informed by OIML R 76 requirements; this software is a workflow tool and should not be treated as a substitute for applicable standards or authorized metrology procedures.

For the web application setup and usage, see the [Frontend README](https://github.com/nadim-dev/SIH-frontend/blob/main/README.md).

## Contents

- [Capabilities](#capabilities)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Local setup](#local-setup)
- [Configuration](#configuration)
- [Run the service](#run-the-service)
- [API overview](#api-overview)
- [Authentication and CORS](#authentication-and-cors)
- [Integrations](#integrations)
- [Repository layout](#repository-layout)
- [Troubleshooting](#troubleshooting)
- [Related documentation](#related-documentation)

## Capabilities

- **Identity and access:** sign-in, sign-out, profile and password management, administrator and testing-officer management, role-protected operations.
- **Laboratory administration:** laboratory profiles, status management, and laboratory-linked personnel.
- **Instrument inspection:** registration, general examination, test planning and execution, environment records, documents, and evidence uploads.
- **Review and reporting:** supervisor evaluation, non-compliance reports, generated reports, certificate records, and public verification endpoints.
- **Operational support:** persisted test drafts, notifications, audit logs, and administrative dashboard summaries.
- **Assisted workflows:** nameplate image text extraction and the NAWI Assistant.

## Architecture

The application is an ES module Node.js service built with Express 5. Route modules map HTTP requests to controllers, middleware handles authentication and file uploads, and Mongoose models persist domain records in MongoDB. Redis is initialized by the Redis configuration module. Cloudinary supports media storage, while configured assistant, image text extraction, and reverse-geocoding workflows provide additional application capabilities.

The frontend is maintained separately in [`../frontend`](../frontend). Its README documents browser setup, API configuration, and build commands.

## Requirements

- Node.js with support for the `--env-file` flag used by the development script
- npm
- A reachable MongoDB instance
- A reachable Redis instance
- Optional credentials for media storage, assistant/image processing, and reverse-geocoding features

Use versions compatible with the dependencies declared in `package.json` and `package-lock.json`.

## Local setup

From the repository root, install backend dependencies:

```powershell
cd backend
npm install
```

Create a local `backend/.env` file. Do not commit real secrets or production connection strings. See [Configuration](#configuration) for the variables read by the current source.

For a local development setup, start MongoDB and Redis before starting the API. The application does not begin listening until the MongoDB connection succeeds; Redis connects during module initialization.

## Configuration

| Variable                | Required          | Purpose                                                                                                                  |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `PORT`                  | No                | HTTP listening port; defaults to `4000`.                                                                                 |
| `DB_URL`                | Yes               | MongoDB connection string used by Mongoose.                                                                              |
| `REDIS_URL`             | Yes               | Redis connection URL. Redis client initialization requires a reachable Redis service.                                    |
| `mySecretKey`           | Yes               | Secret used to sign session cookies. Set a long, unique value and keep it private.                                       |
| `FRONTEND_URL`          | No                | Frontend origin used when backend features construct links; local fallback is `http://localhost:5173` in relevant flows. |
| `CLOUDINARY_CLOUD_NAME` | Feature dependent | Cloudinary cloud name for media uploads.                                                                                 |
| `CLOUDINARY_API_KEY`    | Feature dependent | Cloudinary API key.                                                                                                      |
| `CLOUDINARY_API_SECRET` | Feature dependent | Cloudinary API secret.                                                                                                   |
| `GROQ_API_KEY`          | Feature dependent | Server-side credential used by assistant and image text extraction features.                                             |
| `GROQ_ASSISTANT_MODEL`  | No                | Assistant model configuration.                                                                                           |
| `GROQ_VISION_MODEL`     | No                | Image text extraction model configuration.                                                                               |
| `GEOAPIFY_API_KEY`      | Feature dependent | Geoapify key for reverse geocoding.                                                                                      |

Example local `.env` (replace sample values with your own):

```dotenv
PORT=4000
DB_URL=mongodb://127.0.0.1:27017/nawi_pro
REDIS_URL=redis://127.0.0.1:6379
mySecretKey=replace-with-a-long-random-development-secret
FRONTEND_URL=http://localhost:5173

# Optional integrations
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GROQ_API_KEY=
GROQ_ASSISTANT_MODEL=
GROQ_VISION_MODEL=
GEOAPIFY_API_KEY=
```

The `dev` script loads `.env` with Node's `--env-file` option. The `start` script runs `node app.js` and expects variables to be supplied by the runtime or hosting environment.

## Run the service

Development mode:

```powershell
npm run dev
```

Runtime/production mode:

```powershell
npm start
```

The API listens on `0.0.0.0` using `PORT`, or `4000` when `PORT` is not set. Startup connects MongoDB before opening the HTTP listener. There is no health-check route mounted in `app.js`; use your process manager or platform's health checks as configured for deployment.

## API overview

Every route group is mounted below `/api`. This table lists the route prefixes and their primary responsibilities; see the linked route modules for exact methods, parameters, validation, and authorization behavior.

| Base path              | Purpose                                                                                          | Route definitions                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `/api/auth`            | Authentication, profile, user and testing-officer administration                                 | [`authRoutes.js`](routes/authRoutes.js)                     |
| `/api/instruments`     | Registration, inspections, evaluations, test execution, evidence, NCR, reports, and certificates | [`instrumentRoutes.js`](routes/instrumentRoutes.js)         |
| `/api/laboratories`    | Laboratory profiles and administration                                                           | [`laboratoryRoutes.js`](routes/laboratoryRoutes.js)         |
| `/api/notifications`   | Notification listing and read state                                                              | [`notificationRoutes.js`](routes/notificationRoutes.js)     |
| `/api/audit-logs`      | Audit event history                                                                              | [`auditLogRoutes.js`](routes/auditLogRoutes.js)             |
| `/api/admin/dashboard` | Administrative summary                                                                           | [`adminDashboardRoutes.js`](routes/adminDashboardRoutes.js) |
| `/api/assistant`       | Assistant conversations                                                                          | [`assistantRoutes.js`](routes/assistantRoutes.js)           |
| `/api/test-drafts`     | Save, retrieve, and delete testing drafts                                                        | [`testDraftRoutes.js`](routes/testDraftRoutes.js)           |

Examples of mounted endpoints include:

```text
POST  /api/auth/login
GET   /api/auth/me
POST  /api/instruments/register
GET   /api/instruments/my-evaluations
GET   /api/laboratories
GET   /api/notifications
POST  /api/assistant/chat
GET   /api/instruments/certificate/:number
GET   /api/instruments/reports/verify/:reportId
```

Most user-specific routes require a valid session cookie. Public access and authorization rules vary by route; the route module and its middleware are the source of truth. Do not assume that every endpoint under a given prefix has the same access policy.

## Authentication and CORS

The Express app enables credentialed CORS requests from these configured origins:

- `https://nawipro.netlify.app`
- `https://nawipro12.netlify.app`
- `http://localhost:5173`

If the frontend uses another origin, update the allowlist in [`app.js`](app.js). Authenticated browser requests use signed cookies. Session cookies are configured as `HttpOnly`, `Secure`, and `SameSite=None`, so production deployments must use HTTPS. The frontend Axios client sends credentials for session-backed API calls.

Set `FRONTEND_URL` to the canonical frontend origin in deployed environments where the backend generates links. CORS allowlisting and frontend URL generation are separate settings; configure both where applicable.

## Integrations

- **MongoDB/Mongoose:** application records and workflow state.
- **Redis:** Redis-backed functionality; a connection is opened by `config/redis.js` during module initialization.
- **Cloudinary:** uploaded images and other media, configured through `config/cloudinary.js`.
- **Assistant and image processing:** server-side integrations support conversational assistance and text extraction from instrument nameplate images. Credentials are kept in backend environment configuration.
- **Geoapify:** reverse geocoding when configured.

Provider features require valid credentials and network access. Missing or invalid integration configuration may cause the related feature to fail even when the core API is running.

## Repository layout

```text
backend/
├── app.js              # Express middleware, route mounts, startup
├── config/             # Database, Redis, Cloudinary, session settings
├── controllers/        # Request handlers and workflow logic
├── middleware/         # Authentication and upload middleware
├── models/             # Mongoose schemas and models
├── routes/             # HTTP route definitions
├── rules/              # Inspection rule data
├── utils/              # Shared workflow and integration helpers
└── validators/         # Request validation
```

## Troubleshooting

| Symptom                                                              | Checks                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| API exits before listening                                           | Confirm `DB_URL` is set and MongoDB is reachable; inspect the startup error.                                                                      |
| Redis connection error                                               | Confirm Redis is running and `REDIS_URL` uses the right host, port, and credentials.                                                              |
| Browser reports a CORS or credential error                           | Confirm the page origin exactly matches the allowlist in `app.js`, the request uses credentials, and HTTPS is used for secure production cookies. |
| Login succeeds but later requests appear anonymous                   | Inspect the browser's login `Set-Cookie` and subsequent request `Cookie` headers, including browser cookie-block reasons and cross-site settings. |
| Upload, assistant, image text extraction, or geocoding feature fails | Confirm the relevant server-side configuration and credentials; inspect the backend error output.                                                 |
| `.env` changes do not apply                                          | Restart the Node process; environment variables are read during startup/module initialization.                                                    |

## Related documentation

- [Frontend README](https://github.com/nadim-dev/SIH-frontend/blob/main/README.md)
- [Backend package scripts and dependencies](package.json)
