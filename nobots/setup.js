#!/usr/bin/env node
/**
 * Setup helper - guides user through getting Azure AD credentials
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

console.log(`
╔════════════════════════════════════════════════════════════════╗
║  nobots - Graph API Setup Helper                               ║
╚════════════════════════════════════════════════════════════════╝

This tool needs Azure AD application credentials to access Microsoft Graph.

📋 FOLLOW THESE STEPS:

1️⃣  CREATE AN APP REGISTRATION
   → Go to https://portal.azure.com
   → Search for "App registrations"
   → Click "New registration"
   → Name: "Teams Transcript Fetcher"
   → Click "Register"

2️⃣  COPY YOUR CREDENTIALS
   From the app registration:
   • Tenant ID: Copy from "Directory (tenant) ID" →
   ${fs.existsSync(envPath) ? '✅ Already in .env' : '❌ Paste into GRAPH_TENANT_ID'}

   • Client ID: Copy from "Application (client) ID" →
   ${fs.existsSync(envPath) ? '✅ Already in .env' : '❌ Paste into GRAPH_CLIENT_ID'}

3️⃣  CREATE A CLIENT SECRET
   → Click "Certificates & secrets"
   → Click "New client secret"
   → Copy the secret VALUE (not ID) →
   ${fs.existsSync(envPath) ? '✅ Already in .env' : '❌ Paste into GRAPH_CLIENT_SECRET'}

4️⃣  GRANT API PERMISSIONS
   → Click "API permissions"
   → Click "Add a permission"
   → Select "Microsoft Graph"
   → Select "Application permissions"
   → Search for and add:
      ☐ Calendars.Read
      ☐ OnlineMeetingTranscript.Read.All
   → Click "Grant admin consent"

5️⃣  CONFIGURE .env FILE
   Edit ${path.relative(process.cwd(), envPath)} and fill in:
   
   GRAPH_TENANT_ID=your-tenant-id-here
   GRAPH_CLIENT_ID=your-app-id-here
   GRAPH_CLIENT_SECRET=your-secret-here
   WATCH_USER_ID=user@yourcompany.com

📌 IMPORTANT:
   • Keep GRAPH_CLIENT_SECRET private - never commit to git
   • WATCH_USER_ID should be the person whose calendar to monitor
   • The app needs "Grant admin consent" for permissions

✅ READY?
   Once configured, run:
   $ npm run poll

═════════════════════════════════════════════════════════════════
`);

// Check if .env is configured
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const hasPlaceholder = env.includes('your-') || env.includes('user@company.com');

  if (hasPlaceholder) {
    console.log('⚠️  .env file exists but has placeholder values!\n');
  } else {
    console.log('✅ .env appears to be configured!\n');
    console.log('TRY NOW:  npm run poll\n');
  }
}
