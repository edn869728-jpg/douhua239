# GitHub Actions -> Google Apps Script (GAS) setup

This repository includes a workflow at `.github/workflows/call-gas.yml` that sends a JSON POST request from GitHub Actions to a Google Apps Script (GAS) Web App endpoint.

This setup uses GitHub + GAS directly and does **not** require Cloudflare.

## What the workflow does

- Trigger: manual run (`workflow_dispatch`)
- Optional input: `message`
- Reads repository secrets:
  - `GAS_WEBAPP_URL`
  - `GAS_SHARED_SECRET`
- Fails clearly if either secret is missing
- Sends JSON payload via `curl` with useful GitHub context:
  - `repository`, `actor`, `ref`, `sha`, `workflow`
  - `run_id`, `run_number`, `event_name`
  - `message`

## 1) Create and deploy a GAS Web App

1. Go to [script.new](https://script.new) and create a new Apps Script project.
2. Add `Code.gs` (example below).
3. Click **Deploy** -> **New deployment**.
4. Select type **Web app**.
5. Configure:
   - **Execute as**: Me
   - **Who has access**: Anyone (or your required access policy)
6. Deploy and copy the **Web app URL**.

> When updating script code, redeploy a new version. Usually the Web app URL stays the same for the same deployment, so only update `GAS_WEBAPP_URL` if you create a different deployment URL.

## 2) Set GitHub repository secrets

In GitHub repository settings:

1. Open **Settings** -> **Secrets and variables** -> **Actions**.
2. Add these repository secrets:
   - `GAS_WEBAPP_URL`: your deployed GAS Web App URL
   - `GAS_SHARED_SECRET`: a random shared secret string

Use the same shared secret in your GAS script validation logic.

## 3) Trigger the workflow manually

1. Open **Actions** in GitHub.
2. Select workflow **Call Google Apps Script Web App**.
3. Click **Run workflow**.
4. Optionally enter `message`.
5. Click **Run workflow** and check logs for request/response details.

## Minimal `Code.gs` example

```javascript
function doPost(e) {
  const sharedSecret = PropertiesService.getScriptProperties().getProperty('GAS_SHARED_SECRET');

  let data = {};
  try {
    data = JSON.parse((e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonResponse({ ok: false, error: 'invalid_json' });
  }

  if (!sharedSecret) {
    return jsonResponse({ ok: false, error: 'server_misconfigured' });
  }

  if (!data.secret || data.secret !== sharedSecret) {
    return jsonResponse({ ok: false, error: 'unauthorized' });
  }

  return jsonResponse({
    ok: true,
    received: {
      repository: data.repository,
      actor: data.actor,
      ref: data.ref,
      sha: data.sha,
      workflow: data.workflow,
      run_id: data.run_id,
      run_number: data.run_number,
      event_name: data.event_name,
      message: data.message || ''
    }
  });
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Set Script Property `GAS_SHARED_SECRET` in Apps Script project settings, and use the same value in the GitHub secret `GAS_SHARED_SECRET`.
