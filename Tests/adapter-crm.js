/* Adaptador exclusivo de pruebas. Sequelize conserva sus modelos y genera SQL MySQL;
 * las consultas se ejecutan sobre SQLite aislado. No valida bloqueos de MySQL Server. */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

// Benjamin Orellana - 20/10/2026 - Fixtures adicionales sin duplicar CRM/campus.
export async function conectarPrueba(db, {fixture = 'crm.sqlite.sql', extras = []} = {}) {
  const child = spawn('python3', [fileURLToPath(new URL('./sqlite_crm_bridge.py', import.meta.url)),fixture,...extras], { stdio:['pipe','pipe','pipe'] });
  const pending = new Map();
  let sequence = 0, readyResolve, readyReject, stderr = '';
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const lines = createInterface({ input:child.stdout });
  child.stderr.on('data', data => { stderr += data.toString(); });
  child.on('error', error => readyReject(error));
  child.on('exit', code => {
    if (code !== 0 || pending.size) {
      const error = new Error(stderr || 'Adaptador finalizado inesperadamente.');
      readyReject(error);
      for (const task of pending.values()) task.reject(error);
      pending.clear();
    }
  });
  lines.on('line', line => {
    const message = JSON.parse(line);
    if (message.ready) return readyResolve();
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(Object.assign(new Error(message.error.message), message.error));
    else task.resolve(message.result);
  });
  function send(sql, params = []) {
    const key = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(key, { resolve, reject });
      child.stdin.write(JSON.stringify({ id:key, sql, params }) + '\n');
    });
  }
  await ready;
  const statements = [];
  const connection = {
    uuid:'prueba-crm',
    execute(sql, params, callback) {
      statements.push(sql);
      send(sql, params).then(result => callback(null, result), callback);
      return { setMaxListeners() {} };
    },
    query(input, callback) { return this.execute(typeof input === 'string' ? input : input.sql, [], callback); }
  };
  const getConnection = db.connectionManager.getConnection;
  const releaseConnection = db.connectionManager.releaseConnection;
  db.options.databaseVersion = '8.0.42';
  db.connectionManager.getConnection = async () => connection;
  db.connectionManager.releaseConnection = () => {};
  return {
    statements,
    async close() {
      db.connectionManager.getConnection = getConnection;
      db.connectionManager.releaseConnection = releaseConnection;
      child.stdin.end(JSON.stringify({ close:true }) + '\n');
      await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
      lines.close();
      await db.close();
    }
  };
}
