# Teams Meeting Fetcher - Teams App

Manifest and configuration for deploying the Teams app component.

## Overview

This directory contains the Teams app manifest and supporting files for deploying the "Teams Meeting Fetcher" as a Teams application.

The Teams app can be installed as:
- **Meeting app** - Appears in Teams meeting context
- **Tab app** - Installed as a tab in teams/channels

## Manifest Structure

### manifest.json

**Key Fields**:

```json
{
  "version": "1.0.0",
  "manifestVersion": "1.13",
  "id": "12345678-1234-1234-1234-123456789abc",
  
  "name": {
    "short": "Meeting Fetcher",
    "full": "Teams Meeting Fetcher - Meeting Recording & Transcription"
  },
  
  "description": {
    "short": "Automatically records and transcribes Teams meetings",
    "full": "Teams Meeting Fetcher helps organize record and manage meeting transcriptions from Teams meetings. Organizers can enable recording, and the system automatically fetches transcriptions for easy reference and compliance."
  },
  
  "webApplicationInfo": {
    "id": "YOUR_GRAPH_CLIENT_ID",
    "resource": "api://your-domain.com/YOUR_GRAPH_CLIENT_ID"
  },
  
  "permissions": [
    "identity",
    "identity.user"
  ],
  
  "validDomains": [
    "your-domain.com"
  ],
  
  "icons": {
    "color": "public/icon-color.png",
    "outline": "public/icon-outline.png"
  }
}
```

### manifest-dev.json

Development manifest for testing with ngrok or local tunneling.

Changes from production:
- `id`: Use development UUID
- `webApplicationInfo.resource`: Points to localhost tunnel
- `validDomains`: Include ngrok URL

## Deployment Options

### Option 1: Organization-Wide Deployment

⚠️ **Requires Teams Admin**

1. Go to https://admin.teams.microsoft.com
2. Navigate to **Manage apps → Upload a custom app**
3. Select `manifest.json`
4. Review and approve permissions
5. Choose distribution: **Organization-wide or specific teams**

**Availability**: All users in organization (after approval)

### Option 2: Specific Group/Team Deployment

1. In Teams Admin Center, **target specific teams/users**
2. App appears in team app store
3. Users install from team app store

**Availability**: Only targeted teams/users

### Option 3: Development Testing

1. Enable **Allow sideloading of external apps** in Teams admin settings
2. Enable **Allow uploading custom apps** in org settings
3. In Teams, go to **Apps → Manage your apps → Upload an app**
4. Select `manifest-dev.json`
5. App installed for your user only

**Availability**: Sideloaded app (development only)

## Pre-Deployment Checklist

Before deploying to Teams:

- [ ] Create App Registration in Entra ([**Setup Guide**](../specs/setup-guide.md) Step 1-2)
- [ ] Get Graph Client ID (webApplicationInfo.id)
- [ ] Configure domain (webApplicationInfo.resource)
- [ ] Prepare app icons (128x128 PNG)
- [ ] Replace placeholders in manifest:
  - `YOUR_GRAPH_CLIENT_ID` → actual client ID
  - `your-domain.com` → your domain

## Manifest Fields Explained

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Semantic version of your app (e.g., 1.0.0) |
| `manifestVersion` | Yes | Version of Teams manifest schema (use 1.13+) |
| `id` | Yes | Unique UUID for the app |
| `name.short` | Yes | Short name (30 chars max) |
| `name.full` | No | Full name (100 chars max) |
| `description.short` | Yes | Short description (80 chars max) |
| `description.full` | No | Full description (4000 chars max) |
| `webApplicationInfo.id` | Yes | Azure Entra app registration ID |
| `webApplicationInfo.resource` | Yes | Resource identifier (API URL) |
| `permissions` | Yes | Required permissions; usually `["identity", "identity.user"]` |
| `validDomains` | Yes | Domains where app hosted; e.g., `["your-domain.com"]` |
| `icons.color` | Yes | Color icon (192x192 PNG) |
| `icons.outline` | Yes | Outline icon (32x32 PNG) |
| `composeExtensions` (optional) | No | Message extension capabilities |
| `menus` (optional) | No | Action menu items |

## App Icons

### Requirements

- **Transparent PNG** (recommended)
- **32x32** for outline icon
- **192x192** for color icon
- File size < 32 KB each

### Icon Design Tips

- Contrast against Teams' light/dark theme
- Simple, recognizable design
- Include your logo/company branding (optional)
- Test in Teams UI before deploying

### Icons Included

- `public/icon-outline.png` - Simple outline (use pen/document icon)
- `public/icon-color.png` - Full color version with company colors

## Permissions Requested

When users install the app, Teams prompts for these permissions:

1. **View your profile** (identity)
2. **Sign you in** (identity.user)

The app uses these for:
- Getting user ID and display name
- Delegating meeting access
- Authenticating with Graph API

## Post-Deployment

### Verify Installation

1. Check Teams admin center:
   - **Manage apps → Search for app name**
   - Verify status: **Published** or **Allowed**

2. Check user availability:
   - Go to Teams
   - **Apps → Manage your apps**
   - Should appear in **Your apps**

3. Verify functionality:
   - Open Teams meeting (or create one)
   - Install app if meeting app
   - Check app loads without errors

### Update App

To update after deployment:

1. Modify manifest (e.g., version 1.0.1)
2. Re-upload to Teams Admin Center
3. Choose **Replace existing app**
4. New version rolls out to users

### Revoke App

To remove from organization:

1. Teams Admin Center → **Manage apps**
2. Search for app
3. Click menu → **Delete**
4. Confirm removal

## Troubleshooting

### App Won't Load in Teams

**Cause**: Invalid manifest syntax

**Solution**:
1. Validate manifest with [JSON validator](https://jsonlint.com)
2. Check app ID is UUID format
3. Verify domain is reachable

### "Insufficient Permissions"

**Cause**: Graph API permissions not granted

**Solution** (see [Setup Guide](../specs/setup-guide.md)):
1. Go to Entra → App registrations
2. Verify all 4 Graph permissions added:
   - Calendar.Read
   - Calls.AccessMedia.Read
   - OnlineMeetingArtifact.Read.All
   - TeamsAppInstallation.ReadWrite.All
3. Click **Grant admin consent**
4. Restart app

### Users Can't Install App

**Cause**: Org-wide custom app upload disabled

**Solution**:
1. Teams Admin Center → **Manage apps → App setup policies**
2. Edit default policy
3. Enable **Allow custom apps to be uploaded to the org**
4. Save and wait 24 hours for sync

### Icons Not Showing

**Cause**: Wrong image format or size

**Solution**:
1. Ensure PNG format (not JPG)
2. Check dimensions:
   - Outline: 32x32
   - Color: 192x192
3. Verify files exist in `public/`
4. Re-upload manifest

## Future Enhancements

- [ ] Meeting app context (appear during meeting)
- [ ] Deep links to transcriptions
- [ ] Notification bot
- [ ] Meeting recording widget
- [ ] Admin dashboard (org-wide view)

---

## Additional Resources

- [Teams App Manifest Reference](https://learn.microsoft.com/en-us/microsoftteams/platform/resources/schema/manifest-schema)
- [Getting Started with Teams Apps](https://learn.microsoft.com/en-us/microsoftteams/platform/build-your-first-app/build-first-app-overview)
- [Teams App Best Practices](https://learn.microsoft.com/en-us/microsoftteams/platform/resources/general/resourcesfolderoverview)

