# Implementation Guide — Command Center

This guide covers everything needed to configure, extend, and maintain the Command Center portal.

---

## Phase 1 — Tableau Server Validation (Before Go-Live)

Before wiring dashboards into the portal, verify Tableau Server is structured correctly.

### 1. Confirm Project Structure
Log into Tableau Server and confirm one Project exists per department:
- `HR`
- `Finance`
- `Operations`
- `Sales`

### 2. Confirm Group Alignment
Under **Groups**, confirm one group per department:
- `HR_Users`
- `FIN_Users`
- `OPS_Users`
- `Sales_Users`

### 3. Confirm Permissions
For each Project, confirm:
- The matching group has **View** permission
- No broad "All Users" permission is set on department projects

### 4. Test Access Control
1. Log in as an HR user
2. Attempt to open a Finance dashboard URL directly
3. Expected result: **Access Denied**

If this test passes, Tableau security is complete and the portal can go live.

---

## Phase 2 — Wiring Real Dashboard URLs

Each dashboard card in the department pages has an `href` that points to `embed.html` with three URL parameters:

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `title` | Dashboard display name (URL encoded) | `Headcount+Overview` |
| `dept` | Department name — controls breadcrumb and back button | `HR` |
| `src` | Full Tableau view URL | `https://tableau.upstate.edu/views/HRWorkbook/HeadcountOverview` |

### Finding a Tableau View URL
1. Open Tableau Server in your browser
2. Navigate to the workbook and open the view
3. Copy the URL from the address bar — it will look like:
   ```
   https://tableau.upstate.edu/views/HRAnalytics/HeadcountOverview
   ```
4. Use that path as the `src` parameter

### Example — Updating an HR Dashboard Card in hr.html
Find the card for "Headcount Overview" and update the `href`:

**Before (placeholder):**
```html
href="embed.html?title=Headcount+Overview&dept=HR&src=https://tableau.upstate.edu/views/WORKBOOK/HeadcountOverview"
```

**After (real URL):**
```html
href="embed.html?title=Headcount+Overview&dept=HR&src=https://tableau.upstate.edu/views/HRAnalytics/HeadcountOverview"
```

Repeat for every dashboard card across all four department pages.

---

## Phase 3 — Adding New Dashboards

To add a new dashboard card to an existing department page:

1. Open the relevant department file (e.g. `hr.html`)
2. Copy an existing `<div class="dash-card">` block
3. Update the title, description, and `href` with the real Tableau URL
4. Save — the card appears in the grid automatically

### Dashboard Card Template
```html
<div class="dash-card">
  <div class="dash-card-accent" style="background: var(--dept-hr);"></div>
  <div class="dash-card-body">
    <h3>Dashboard Title</h3>
    <p>Short description of what this dashboard shows.</p>
    <span class="tag tag-hr">HR</span>
  </div>
  <div class="dash-card-footer">
    <a class="open-btn btn-hr"
       href="embed.html?title=Dashboard+Title&dept=HR&src=https://tableau.upstate.edu/views/WORKBOOK/VIEWNAME">
      Open Dashboard &#8594;
    </a>
  </div>
</div>
```

**Color variables by department:**

| Department | Accent variable | Tag class | Button class |
|------------|----------------|-----------|--------------|
| HR | `--dept-hr` | `tag-hr` | `btn-hr` |
| Finance | `--dept-finance` | `tag-fin` | `btn-fin` |
| Operations | `--dept-operations` | `tag-ops` | `btn-ops` |
| Sales | `--dept-sales` | `tag-sales` | `btn-sales` |

---

## Phase 4 — Adding a New Department

To add a new department (e.g. IT):

### Step 1 — Create the department page
Copy `hr.html` → `it.html`. Update:
- `<title>` tag
- Department banner color: change `banner-hr` to a new CSS class
- All card accent colors, tag classes, button classes
- All `embed.html` links — change `dept=HR` to `dept=IT`

### Step 2 — Add a color to styles.css
```css
:root {
  --dept-it: #8e44ad;   /* add this line */
}
.banner-it { background: var(--dept-it); }
.tag-it    { background: #f5eef8; color: var(--dept-it); }
.btn-it    { background: var(--dept-it); }
```

### Step 3 — Add the card to index.html
Copy an existing department card block in `index.html`, update the color class, icon, title, description, and link to `it.html`.

### Step 4 — Add to embed.html's dept map
In `embed.html`, find the `deptPages` object in the `<script>` block and add:
```js
'IT': 'it.html',
```

---

## Phase 5 — Optional: Auto-Generate Dashboard Lists via Tableau REST API

Instead of manually maintaining dashboard cards, you can query the Tableau REST API to automatically pull all workbooks in a project.

### Tableau REST API Endpoint
```
GET https://tableau.upstate.edu/api/{api-version}/sites/{site-id}/projects/{project-id}/workbooks
```

### Approach
1. Create a lightweight script (Python or Node.js) that:
   - Authenticates to Tableau REST API using a service account
   - Fetches all views in a given project
   - Outputs a `dashboards.json` file with name, workbook, and view path
2. The department HTML pages load `dashboards.json` at runtime and render cards dynamically
3. Run the script on a schedule (e.g. nightly) to keep the list current

This is the **Phase 2 maturity model** — any dashboard added to the HR project in Tableau automatically appears in the HR portal page.

---

## Deployment Checklist

- [ ] Tableau Server projects created per department
- [ ] Tableau groups created and assigned to projects
- [ ] Permissions tested (cross-department access denied)
- [ ] All `WORKBOOK/VIEWNAME` placeholders replaced with real Tableau URLs
- [ ] Portal hosted on internal web server or Azure Static Web Apps
- [ ] URL shared with users (no login to portal required — Tableau SSO handles it)
- [ ] Tested in Chrome and Edge (primary enterprise browsers)

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Iframe shows blank / login screen | User not authenticated to Tableau | Have user log into `tableau.upstate.edu` directly first, then return to portal |
| "Access Denied" in iframe | User lacks permission on that Tableau project | Correct group membership in Tableau Server |
| Iframe blocked by browser | Running on `file://` protocol | Serve via Live Server, Python `http.server`, or a real web host |
| Dashboard not found | Wrong workbook/view name in URL | Copy the exact path from Tableau Server address bar |
