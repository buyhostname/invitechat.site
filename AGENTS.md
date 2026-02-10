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

Provide the bot invite link with required permissions:
```
https://discord.com/oauth2/authorize?client_id={DISCORD_CLIENT_ID}&permissions=268435472&scope=bot
```

Permission breakdown:
- `268435456` - Manage Roles (to assign roles to users)
- `16` - Manage Channels (to create the "paid" channel)

Remind user: The bot's role must be HIGHER than the role it assigns in Server Settings > Roles.

---

## Telegram Setup (Optional but Recommended)

Users get access to BOTH Discord AND Telegram after payment. Follow these steps to configure Telegram.

### 11. Ask for Telegram Bot Token

Ask the user:

```
I need your Telegram bot credentials. Create a bot via @BotFather on Telegram:

1. Open Telegram and message @BotFather
2. Send /newbot
3. Choose a name for your bot (e.g., "InviteChat Premium")
4. Choose a username ending in "bot" (e.g., "InviteChatSiteBot")
5. Copy the bot token (looks like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz)

Please paste your TELEGRAM_BOT_TOKEN:
```

Save the token to `.env` as `TELEGRAM_BOT_TOKEN`.

### 12. Ask for Bot Username

Ask the user:

```
What is your bot's username? (without the @ symbol)
Example: If your bot is @MyPremiumBot, enter: MyPremiumBot
```

Save to `.env` as `TELEGRAM_BOT_USERNAME`.

### 13. Ask for Telegram Group ID

Ask the user:

```
I need your Telegram private group ID.

To find it:
1. Create a private group in Telegram (if you haven't already)
2. Add @userinfobot to your private group temporarily
3. It will post the group ID (a negative number like -1001234567890 or -5237161373)
4. Copy that ID
5. Remove @userinfobot from the group

Please paste your TELEGRAM_GROUP_ID:
```

Save to `.env` as `TELEGRAM_GROUP_ID`.

### 14. Add Bot to Group as Admin

Instruct the user:

```
Now add your Telegram bot to the private group as an administrator:

1. Open your private group in Telegram
2. Tap the group name at the top to open Group Info
3. Tap "Administrators" or "Add Admin"
4. Search for your bot (@YourBotUsername)
5. Enable this permission:
   - "Invite Users via Link" (required for generating invite links)
6. Save/Done

Confirm: Have you added the bot as admin with "Invite Users via Link" permission? (yes/no)
```

Wait for confirmation before proceeding.

### 15. Update .env with Telegram Variables

Add these lines to the `.env` file:

```env
# Telegram
TELEGRAM_BOT_TOKEN={collected}
TELEGRAM_BOT_USERNAME={collected}
TELEGRAM_GROUP_ID={collected}
```

### 16. Restart Application

```bash
pm2 restart main-3000
```

---

## Post-Installation

On first startup, the bot automatically:
1. Creates a "paid" channel (if not exists) with permissions:
   - `@everyone` - denied ViewChannel
   - Paid role - allowed ViewChannel, SendMessages, ReadMessageHistory
2. Generates `DISCORD_INVITE` permanent link (maxAge=0, maxUses=0)
3. Appends invite to `.env` and restarts itself

Check logs with: `pm2 logs --nostream`

## Troubleshooting

### Unknown Guild Error
```
DiscordAPIError[10004]: Unknown Guild
```
Bot is not in the server or wrong DISCORD_GUILD_ID. 
- Re-invite bot using the invite link above
- Or verify DISCORD_GUILD_ID is correct (right-click server > Copy Server ID)

### Missing Permissions Error  
```
DiscordAPIError[50013]: Missing Permissions
```
Two possible causes:
1. **Role hierarchy**: Bot's role must be HIGHER than the role it assigns. Drag bot's role above the assigned role in Server Settings > Roles.
2. **Missing bot permissions**: Re-invite bot with correct permissions (268435472) or manually add "Manage Roles" and "Manage Channels" to bot's role.

### Role Assignment Not Working
Ensure user has completed OAuth flow and is in the server.

### Channel Creation Failed
Bot needs "Manage Channels" permission. Re-invite with permissions=268435472 or add permission manually.

---

## Telegram Troubleshooting

### Bot Can't Create Invite Links
```
Error: CHAT_ADMIN_REQUIRED
```
Bot is not an admin in the group or doesn't have "Invite Users via Link" permission.
- Open group settings > Administrators > Edit bot permissions
- Enable "Invite Users via Link"

### Chat Not Found
```
Error: Bad Request: chat not found
```
The group ID is incorrect or bot is not a member of the group.
- Verify group ID using @userinfobot
- Make sure bot is added to the group first, then made admin

### Telegram Login Widget Not Appearing
The widget requires `TELEGRAM_BOT_USERNAME` to be set correctly.
- Check `.env` has `TELEGRAM_BOT_USERNAME=YourBotName` (without @)
- Bot must have a username set via @BotFather
- Restart the application after setting

### Auth Verification Failed
```
error=telegram_auth_failed
```
The Telegram Login Widget data couldn't be verified.
- Ensure `TELEGRAM_BOT_TOKEN` is correct
- Token must match the bot username exactly

### Invite Link Expired
One-time invite links expire after 1 hour. User needs to re-authenticate via Telegram Login Widget to get a new link.
