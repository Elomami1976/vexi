/** Creates a demo session fixture in the current project (for manual replay testing). */
import { SessionRecorder } from '../dist/replay/recorder.js';

const r = new SessionRecorder(process.cwd(), {
  project: 'demo-app',
  provider: 'Groq',
  model: 'llama-3.3-70b',
  lang: 'en',
});
r.add('user', 'Add JWT auth to my Express API');
r.add(
  'assistant',
  "Here is the plan:\n\n1. Install jsonwebtoken\n2. Create middleware\n\n```js\nconst jwt = require('jsonwebtoken');\nfunction auth(req, res, next) {\n  const token = req.headers.authorization;\n  jwt.verify(token, process.env.SECRET);\n  next();\n}\n```",
);
r.add('user', 'Looks good, add refresh tokens');
r.add('assistant', 'Refresh token flow added with a /token/refresh endpoint.');
await r.save();
console.log('fixture saved');
