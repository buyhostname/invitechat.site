require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.set('trust proxy', true);
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

const PORT = process.env.PORT || 3000;

// Serve bridge.js dynamically
app.get('/bridge.js', (req, res) => {
    const host = req.hostname;
    const adminHost = host.startsWith('admin.') ? host : 'admin.' + host;
    
    res.type('application/javascript');
    res.send(`
(function() {
    const ADMIN_URL = 'wss://${adminHost}/bridge';
    
    let ws;
    let reconnectTimer;
    let clientId = null;
    
    const handlers = {
        navigate: async (action) => {
            const url = action.url;
            setTimeout(() => { window.location.href = url; }, 50);
            return { navigating: url };
        },
        
        fill: async (action) => {
            const el = document.querySelector(action.selector);
            if (!el) throw new Error('Element not found: ' + action.selector);
            el.value = action.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { filled: action.selector, value: action.value };
        },
        
        click: async (action) => {
            const el = document.querySelector(action.selector);
            if (!el) throw new Error('Element not found: ' + action.selector);
            el.click();
            return { clicked: action.selector };
        },
        
        type: async (action) => {
            const el = document.querySelector(action.selector);
            if (!el) throw new Error('Element not found: ' + action.selector);
            el.focus();
            for (const char of action.text) {
                el.value += char;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, action.delay || 20));
            }
            return { typed: action.text.length + ' chars' };
        },
        
        wait: async (action) => {
            if (action.selector) {
                const start = Date.now();
                const timeout = action.timeout || 10000;
                while (Date.now() - start < timeout) {
                    if (document.querySelector(action.selector)) {
                        return { found: action.selector };
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
                throw new Error('Timeout waiting for: ' + action.selector);
            } else if (action.ms) {
                await new Promise(r => setTimeout(r, action.ms));
                return { waited: action.ms };
            }
        },
        
        eval: async (action) => {
            const result = await eval(action.code);
            if (result instanceof Element) return result.outerHTML;
            if (result instanceof NodeList || Array.isArray(result)) {
                return Array.from(result).map(el => el instanceof Element ? el.outerHTML : el);
            }
            return result;
        },
        
        get: async (action) => {
            const el = document.querySelector(action.selector);
            if (!el) throw new Error('Element not found: ' + action.selector);
            return {
                text: el.innerText,
                value: el.value,
                html: action.html ? el.innerHTML : undefined
            };
        }
    };
    
    function connect() {
        if (ws && ws.readyState === WebSocket.OPEN) return;
        
        try {
            ws = new WebSocket(ADMIN_URL);
            
            ws.onopen = () => {
                console.log('[bridge] connected to', ADMIN_URL);
                ws.send(JSON.stringify({ type: 'hello', url: location.href }));
            };
            
            ws.onmessage = async (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    
                    if (msg.type === 'welcome') {
                        clientId = msg.clientId;
                        console.log('[bridge] assigned client ID:', clientId);
                        return;
                    }
                    
                    if (msg.type === 'task') {
                        let result, error;
                        try {
                            if (msg.action && handlers[msg.action.type]) {
                                result = await handlers[msg.action.type](msg.action);
                            } else if (msg.code) {
                                result = await eval(msg.code);
                                if (result instanceof Element) result = result.outerHTML;
                                if (result instanceof NodeList || Array.isArray(result)) {
                                    result = Array.from(result).map(el => el instanceof Element ? el.outerHTML : el);
                                }
                            }
                        } catch (e) {
                            error = e.message;
                        }
                        ws.send(JSON.stringify({ type: 'result', taskId: msg.taskId, result, error }));
                    }
                } catch (e) {
                    console.error('[bridge] message error:', e);
                }
            };
            
            ws.onclose = () => {
                console.log('[bridge] disconnected, reconnecting in 3s...');
                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connect, 3000);
            };
            
            ws.onerror = (e) => {
                console.error('[bridge] error:', e);
            };
        } catch (e) {
            console.error('[bridge] connection error:', e);
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connect, 3000);
        }
    }
    
    connect();
})();
`);
});

// Home page
app.get('/', (req, res) => {
    res.render('index', { title: 'Home' });
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
    console.log(`Main app running on port ${PORT}`);
});
