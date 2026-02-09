# InviteChat Installation Guide for AI Agents

This file instructs AI agents on how to set up InviteChat on a fresh installation.

## Installation Steps

When a user asks to install/setup InviteChat, follow these steps in order:

### 1. Ask for Domain

Ask the user: "What domain will this be hosted on? (e.g., invitechat.site)"

Store this as `DOMAIN` for use in configuration.

### 2. Ask for Stripe Keys

Ask the user for their Stripe API keys:

```
I need your Stripe API keys. You can find them at https://dashboard.stripe.com/apikeys

1. STRIPE_PUBLISHABLE_KEY (starts with pk_test_ or pk_live_)
2. STRIPE_SECRET_KEY (starts with sk_test_ or sk_live_)

Please paste both keys.
```

### 3. Setup Stripe Webhook

After receiving Stripe keys, create a webhook automatically:

```bash
# Create webhook for the domain
stripe webhooks create \
  --url "https://${DOMAIN}/webhook" \
  --enabled-events checkout.session.completed,payment_intent.succeeded
```

Or instruct user to create manually at https://dashboard.stripe.com/webhooks with:
- Endpoint URL: `https://{DOMAIN}/webhook`
- Events: `checkout.session.completed`, `payment_intent.succeeded`

### 4. Ask for Discord Configuration

Ask the user for Discord credentials:

```
I need your Discord application credentials. Create an app at https://discord.com/developers/applications

1. DISCORD_CLIENT_ID - Found at: General Information > Application ID
2. DISCORD_CLIENT_SECRET - Found at: OAuth2 > Client Secret
3. DISCORD_BOT_TOKEN - Found at: Bot > Token (click Reset Token if not visible)

Also make sure to:
- Enable "Server Members Intent" under Bot > Privileged Gateway Intents
- Add redirect URI: https://{DOMAIN}/redirect under OAuth2 > Redirects

Please paste the three values.
```

### 5. Ask for Guild and Role IDs

```
Now I need your Discord server details:

1. DISCORD_GUILD_ID - Right-click your server name > Copy Server ID
   (Enable Developer Mode first: User Settings > App Settings > Advanced)

2. DISCORD_ROLE_ID - Server Settings > Roles > Right-click the role > Copy Role ID
   (Make sure to create a role for premium members first!)

Please paste both IDs.
```

### 6. Generate Session Secret

Generate automatically:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 7. Create .env File

Create the `.env` file with all collected values:

```env
PORT=3000
PRODUCTION=true

# Stripe
STRIPE_PUBLISHABLE_KEY={collected}
STRIPE_SECRET_KEY={collected}

# Discord
DISCORD_CLIENT_ID={collected}
DISCORD_CLIENT_SECRET={collected}
DISCORD_BOT_TOKEN={collected}
DISCORD_REDIRECT_URI=https://{DOMAIN}/redirect
DISCORD_GUILD_ID={collected}
DISCORD_ROLE_ID={collected}

# Session
SESSION_SECRET={generated}
```

Note: `DISCORD_INVITE` will be auto-generated on first startup.

### 8. Install Dependencies and Start

```bash
npm install
pm2 start index.js --name "main-3000"
```

### 9. Setup Nginx

Create nginx config for the domain with SSL via certbot.

### 10. Add Bot to Server

Provide the bot invite link:
```
https://discord.com/oauth2/authorize?client_id={DISCORD_CLIENT_ID}&permissions=268435456&scope=bot
```

Remind user: The bot's role must be HIGHER than the role it assigns in Server Settings > Roles.

## Post-Installation

- `DISCORD_INVITE` auto-generates on first startup if missing
- App will restart itself after generating the invite
- Check logs with: `pm2 logs --nostream`

## Troubleshooting

### Unknown Guild Error
Bot is not in the server or wrong DISCORD_GUILD_ID. Re-invite bot or fix the ID.

### Missing Permissions Error  
Bot's role is too low. Drag bot's role above the assigned role in Server Settings > Roles.

### Role Assignment Not Working
Ensure user has completed OAuth flow and is in the server.
