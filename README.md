# Command Center — Upstate Reporting Portal

A lightweight internal navigation portal that provides department-based access to Tableau dashboards. Users authenticate directly to Tableau Server via Azure AD SSO. The portal does not manage authentication — it provides organized navigation and embedded dashboard views.

---

## Overview

| Item | Detail |
|------|--------|
| **Type** | Static HTML portal (no framework, no backend) |
| **Tableau Server** | https://tableau.upstate.edu |
| **Auth** | Azure AD SSO (handled entirely by Tableau Server) |
| **Hosting** | Any static file host — IIS, Nginx, Azure Static Web Apps, SharePoint |
| **Departments** | HR · Finance · Operations · Sales |

---

## How It Works

```
User opens portal
       ↓
Clicks department (e.g. HR)
       ↓
Sees list of HR dashboards
       ↓
Clicks "Open Dashboard"
       ↓
embed.html loads dashboard in full-viewport iframe
       ↓
Azure AD SSO authenticates automatically via Tableau Server
       ↓
Tableau enforces project/group permissions
```

The portal is a **presentation layer only**. Tableau Server remains the authentication and authorization engine.

---

## File Structure

```
command-center/
├── index.html          Home page — department selection
├── hr.html             HR dashboard list
├── finance.html        Finance dashboard list
├── operations.html     Operations dashboard list
├── sales.html          Sales dashboard list
├── embed.html          Generic Tableau embed page (reads URL params)
├── css/
│   └── styles.css      Shared stylesheet
├── README.md           This file
└── IMPLEMENTATION.md   Setup and configuration guide
```

---

## Security Model

Security is enforced entirely in **Tableau Server**:

- One Project per department (HR Project, Finance Project, etc.)
- One Group per department (HR_Users, FIN_Users, OPS_Users, Sales_Users)
- Permissions set at the Project level
- No broad "All Users" access on department projects

The portal has no role in access control. If a user without HR access somehow obtains an HR dashboard URL, Tableau Server will deny access.

---

## Deployment

### Local (Development)
Open with VS Code Live Server or run:
```bash
python -m http.server 8080
```
Then visit `http://localhost:8080`

### Production
Copy all files to any static web host:
- **IIS** — drop into a virtual directory
- **Nginx** — serve from root with `try_files $uri $uri/ =404`
- **Azure Static Web Apps** — connect this repo, deploy automatically
- **SharePoint** — embed pages via the web part

---

## Tableau Embedding

Dashboard links use this URL pattern:
```
embed.html?title=Dashboard+Name&dept=HR&src=https://tableau.upstate.edu/views/WorkbookName/ViewName
```

The embed page appends Tableau parameters automatically:
```
?:embed=yes&:toolbar=yes&:tabs=no&:showVizHome=no
```

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for full wiring instructions.
