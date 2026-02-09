require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const Stripe = require('stripe');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Discord bot setup
const discordBot = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

discordBot.once('clientReady', async () => {
    console.log(`Discord bot logged in as ${discordBot.user.tag}`);
    
    if (!process.env.DISCORD_GUILD_ID) {
        console.error('DISCORD_GUILD_ID not set, skipping startup tasks');
        return;
    }
    
    try {
        const guild = await discordBot.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const roleId = process.env.DISCORD_ROLE_ID;
        
        // Ensure "paid" channel exists with role-only access
        if (roleId) {
            const channels = await guild.channels.fetch();
            let paidChannel = channels.find(c => c.name === 'paid' && c.type === 0);
            
            if (!paidChannel) {
                console.log('Creating "paid" channel with role-only access...');
                paidChannel = await guild.channels.create({
                    name: 'paid',
                    type: 0, // Text channel
                    permissionOverwrites: [
                        {
                            id: guild.id, // @everyone
                            deny: ['ViewChannel']
                        },
                        {
                            id: roleId,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                        }
                    ]
                });
                console.log(`Created "paid" channel: ${paidChannel.id}`);
            } else {
                console.log(`"paid" channel already exists: ${paidChannel.id}`);
            }
        }
        
        // Auto-generate DISCORD_INVITE if not set
        if (!process.env.DISCORD_INVITE) {
            console.log('DISCORD_INVITE not set, generating permanent invite...');
            const channels = await guild.channels.fetch();
            const textChannel = channels.find(c => c.type === 0);
            
            if (textChannel) {
                const invite = await textChannel.createInvite({
                    maxAge: 0,
                    maxUses: 0,
                    unique: true
                });
                
                const inviteUrl = `https://discord.gg/${invite.code}`;
                console.log(`Generated invite: ${inviteUrl}`);
                
                // Append to .env file
                const envPath = path.join(__dirname, '.env');
                fs.appendFileSync(envPath, `\nDISCORD_INVITE=${inviteUrl}\n`);
                console.log('Added DISCORD_INVITE to .env, restarting...');
                
                // Crash to trigger pm2 restart with new env
                process.exit(1);
            } else {
                console.error('No text channel found to create invite');
            }
        }
    } catch (err) {
        console.error('Startup tasks failed:', err.message);
    }
});

discordBot.login(process.env.DISCORD_BOT_TOKEN).catch(err => {
    console.error('Discord bot login failed:', err.message);
});

app.set('trust proxy', true);
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.PRODUCTION === 'true',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

const PORT = process.env.PORT || 3000;

// Home page - show payment page
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'InviteChat - Premium Access',
        stripeKey: process.env.STRIPE_PUBLISHABLE_KEY,
        user: req.session.user,
        paid: req.session.paid
    });
});

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'InviteChat Premium Access',
                        description: 'Get exclusive Discord role and premium features'
                    },
                    unit_amount: 399, // $3.99
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `https://${req.hostname}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `https://${req.hostname}/`,
        });
        
        res.json({ url: session.url });
    } catch (error) {
        console.error('Stripe error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Payment success - verify and mark as paid
app.get('/payment-success', async (req, res) => {
    try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
            return res.redirect('/');
        }
        
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        
        if (session.payment_status === 'paid') {
            req.session.paid = true;
            req.session.stripeSessionId = sessionId;
            res.render('payment-success', { 
                title: 'Payment Successful',
                user: req.session.user
            });
        } else {
            res.redirect('/');
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.redirect('/');
    }
});

// Discord OAuth - initiate login
app.get('/login', (req, res) => {
    if (!req.session.paid) {
        return res.redirect('/');
    }
    
    const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds.join'
    });
    
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// Discord OAuth callback
app.get('/redirect', async (req, res) => {
    const code = req.query.code;
    
    if (!code) {
        return res.redirect('/');
    }
    
    try {
        // Exchange code for token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.DISCORD_REDIRECT_URI
            })
        });
        
        const tokens = await tokenResponse.json();
        
        if (tokens.error) {
            console.error('Discord token error:', tokens);
            return res.redirect('/?error=discord_auth_failed');
        }
        
        // Get user info
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`
            }
        });
        
        const user = await userResponse.json();
        
        req.session.user = {
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.avatar,
            accessToken: tokens.access_token
        };
        
        // If user has paid, assign role
        if (req.session.paid && process.env.DISCORD_GUILD_ID && process.env.DISCORD_ROLE_ID) {
            try {
                const guild = await discordBot.guilds.fetch(process.env.DISCORD_GUILD_ID);
                const member = await guild.members.fetch(user.id).catch(() => null);
                
                if (member) {
                    await member.roles.add(process.env.DISCORD_ROLE_ID);
                    req.session.roleAssigned = true;
                    console.log(`Assigned role to ${user.username} (${user.id})`);
                } else {
                    // User not in server, try to add them using OAuth token
                    await fetch(`https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`, {
                        method: 'PUT',
                        headers: {
                            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            access_token: tokens.access_token,
                            roles: [process.env.DISCORD_ROLE_ID]
                        })
                    });
                    req.session.roleAssigned = true;
                    console.log(`Added ${user.username} to server with role`);
                }
            } catch (err) {
                console.error('Role assignment error:', err);
            }
        }
        
        res.redirect('/success');
    } catch (error) {
        console.error('Discord OAuth error:', error);
        res.redirect('/?error=discord_auth_failed');
    }
});

// Success page after Discord login
app.get('/success', (req, res) => {
    if (!req.session.user || !req.session.paid) {
        return res.redirect('/');
    }
    
    res.render('success', {
        title: 'Welcome!',
        user: req.session.user,
        roleAssigned: req.session.roleAssigned,
        discordInvite: process.env.DISCORD_INVITE || 'https://discord.gg/YOUR_INVITE_CODE'
    });
});

// API interactions endpoint (for Discord)
app.post('/api/interactions', express.raw({ type: 'application/json' }), (req, res) => {
    // Discord interaction verification would go here
    // For now, just acknowledge
    res.status(200).json({ type: 1 });
});

// Verify user endpoint
app.get('/verify-user', (req, res) => {
    res.render('verify-user', { title: 'Verify Your Account' });
});

// Terms of Service
app.get('/terms-of-service', (req, res) => {
    res.render('terms', { title: 'Terms of Service' });
});

// Privacy Policy
app.get('/privacy-policy', (req, res) => {
    res.render('privacy', { title: 'Privacy Policy' });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        status: 404,
        message: 'The page you are looking for does not exist.'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).render('error', {
        title: 'Error',
        status: err.status || 500,
        message: process.env.PRODUCTION === 'true' ? 'Something went wrong.' : err.message
    });
});

app.listen(PORT, () => {
    console.log(`InviteChat running on port ${PORT}`);
});
