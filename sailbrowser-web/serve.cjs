/**
 * App Hosting entrypoint. Reads PORT from the environment (Cloud Run sets PORT=8080).
 * apphosting.yaml runCommand does not expand $PORT, so we cannot pass it on the CLI.
 */
const { join } = require('node:path');
const superstaticServer = require('superstatic/lib/server');

const port = Number(process.env.PORT) || 8080;
const root = join(__dirname, 'dist/sailbrowser-web/browser');

const app = superstaticServer({
  cwd: root,
  config: join(__dirname, 'superstatic.json'),
  port,
  hostname: '0.0.0.0',
});

app.listen(() => {
  console.log(`Superstatic listening on 0.0.0.0:${port}`);
});
